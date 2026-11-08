import type { AlertSeverity, SecurityStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { notifyOrg } from "@/server/community/notifications";
import { sendEmail } from "@/server/email/send";
import { actionEmail } from "@/server/email/templates";
import { maxSeverity, scanListing, type CheckOutcome } from "./scan";
import { adminOrigin } from "@/lib/hosts";
import { getSection } from "@/server/settings/store";

const SEV: AlertSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const STATUS_ORDER: SecurityStatus[] = ["NOT_SCANNED", "PASSED", "WARNING", "UNDER_INVESTIGATION", "RESTRICTED"];
export const maxStatus = (a: SecurityStatus, b: SecurityStatus): SecurityStatus => (STATUS_ORDER.indexOf(a) >= STATUS_ORDER.indexOf(b) ? a : b);
const atLeast = (s: AlertSeverity, min: AlertSeverity) => SEV.indexOf(s) >= SEV.indexOf(min);

/**
 * Emails an administrator alert to the recipients set in Admin → Settings →
 * Notifications (default: every active Super Admin, Admin and Moderator).
 */
export async function notifyAdmins(subject: string, intro: string, path: string) {
  const c = await getSection("notifications");
  if (!c.bool("emailAdminAlerts")) return;
  const configured = c.str("adminAlertEmails").split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
  const recipients = configured.length
    ? [...new Set(configured)]
    : (await db.adminUser.findMany({ where: { status: "ACTIVE", role: { in: ["SUPER_ADMIN", "ADMIN", "MODERATOR"] } }, select: { email: true } })).map((a) => a.email);
  const m = actionEmail({ title: subject, intro, actionLabel: "Open admin portal", url: `${adminOrigin()}${path}` });
  for (const to of recipients) await sendEmail({ to, subject: `[Webcenta Admin] ${subject}`, template: "admin-alert", ...m });
}

export async function nextScanDate(riskTier: "LOW" | "MEDIUM" | "HIGH" | "PROHIBITED", from = new Date()) {
  const p = await db.monitoringPolicy.findUnique({ where: { riskTier } });
  return new Date(from.getTime() + (p?.scanIntervalHours ?? 168) * 3600_000);
}

/**
 * Applies the security response for a published listing after a monitoring scan:
 * alerts (deduplicated), status change, automatic restriction when the severity
 * reaches the tier policy threshold, admin + developer notifications.
 */
export async function respondToScan(listingId: string, scanId: string, outcomes: CheckOutcome[]) {
  const listing = await db.listing.findUniqueOrThrow({ where: { id: listingId } });
  const policy = await db.monitoringPolicy.findUnique({ where: { riskTier: listing.riskTier } });
  const threshold: AlertSeverity = policy?.autoRestrictAtSeverity ?? "CRITICAL";

  // Reachability problems only become alerts after 3 consecutive failed scans.
  const reach = outcomes.find((o) => o.check === "HTTP_REACHABILITY");
  if (reach && reach.verdict !== "PASS") {
    const recent = await db.securityScan.findMany({ where: { listingId, status: "COMPLETED" }, orderBy: { createdAt: "desc" }, take: 3, include: { checks: { where: { check: "HTTP_REACHABILITY" } } } });
    const consecutive = recent.length === 3 && recent.every((s) => s.checks.some((c) => c.verdict !== "PASS"));
    if (!consecutive) reach.severity = "LOW";
  }

  const findings = outcomes.filter((o) => (o.verdict === "FAIL" || o.verdict === "WARN") && o.severity && atLeast(o.severity, "MEDIUM"));
  const top = maxSeverity(findings.map((f) => f.severity));
  const restrict = Boolean(top && atLeast(top, threshold));
  const openAuto = await db.securityAlert.count({ where: { listingId, autoRestricted: true, status: { in: ["OPEN", "INVESTIGATING"] } } });

  for (const f of findings) {
    const title = `${f.check.replace(/_/g, " ").toLowerCase()}: ${f.summary}`.slice(0, 200);
    const existing = await db.securityAlert.findFirst({ where: { listingId, title, status: { in: ["OPEN", "INVESTIGATING"] } } });
    if (existing) {
      await db.securityAlert.update({ where: { id: existing.id }, data: { scanId, evidence: f.evidence as never } });
    } else {
      await db.securityAlert.create({ data: { listingId, scanId, severity: f.severity!, title, details: f.summary, evidence: f.evidence as never, autoRestricted: restrict && atLeast(f.severity!, threshold) } });
    }
  }

  // Monitoring may RAISE the security status, but never lowers it while alerts are
  // open; a RESTRICTED listing is only lifted by an administrator (alert resolution).
  const computed: SecurityStatus = restrict || openAuto > 0 ? "RESTRICTED"
    : top === "HIGH" || top === "CRITICAL" ? "UNDER_INVESTIGATION"
    : top === "MEDIUM" ? "WARNING" : "PASSED";
  const openAlerts = await db.securityAlert.count({ where: { listingId, status: { in: ["OPEN", "INVESTIGATING"] } } });
  const status: SecurityStatus = listing.securityStatus === "RESTRICTED" ? "RESTRICTED"
    : openAlerts > 0 ? maxStatus(listing.securityStatus, computed)
    : computed;

  await db.listing.update({ where: { id: listingId }, data: { securityStatus: status, lastScannedAt: new Date(), nextScanAt: await nextScanDate(listing.riskTier) } });

  if (status !== listing.securityStatus && (status === "RESTRICTED" || status === "UNDER_INVESTIGATION")) {
    if (status === "RESTRICTED") {
      await db.moderationAction.create({ data: { actorType: "SYSTEM", action: "LISTING_SUSPEND", targetType: "Listing", targetId: listingId, reason: `Automatic restriction after security scan (${top})`, metadata: { scanId } } });
      await audit({ actorType: "SYSTEM", action: "listing.security.auto-restrict", targetType: "Listing", targetId: listingId, metadata: { scanId, severity: top } });
    }
    await notifyAdmins(`Security alert (${top}) for ${listing.name}`, `A monitoring scan of ${listing.domain} found: ${findings.map((f) => f.summary).join("; ")}. Status: ${status}.`, `/security/alerts?listing=${listingId}`);
    if (listing.developerId) {
      await notifyOrg(listing.developerId, { type: "SECURITY_NOTICE", title: `Security review of ${listing.name}`, body: status === "RESTRICTED" ? "Your listing is temporarily hidden while our team reviews a security finding." : "Our team is reviewing a security finding for your listing.", linkPath: "/developer" });
    }
  }
  return { status, alerts: findings.length, top };
}

/** Job: run a monitoring scan for one listing and apply the response. */
export async function monitorListing(listingId: string, trigger: "SCHEDULED" | "MANUAL" | "REPORT" = "SCHEDULED", adminId?: string) {
  const { scan, outcomes } = await scanListing(listingId, trigger, { adminId });
  const l = await db.listing.findUniqueOrThrow({ where: { id: listingId }, select: { status: true } });
  if (l.status === "PUBLISHED" || l.status === "SUSPENDED") return { scan, ...(await respondToScan(listingId, scan.id, outcomes)) };
  await db.listing.update({ where: { id: listingId }, data: { lastScannedAt: new Date() } });
  return { scan, status: null, alerts: 0, top: null };
}

/** Job: enqueue due monitoring scans (bounded per tick). */
export async function enqueueDueScans(limit = 20): Promise<number> {
  const due = await db.listing.findMany({
    where: { status: { in: ["PUBLISHED", "SUSPENDED"] }, deletedAt: null, OR: [{ nextScanAt: null }, { nextScanAt: { lte: new Date() } }] },
    orderBy: [{ nextScanAt: { sort: "asc", nulls: "first" } }], take: limit, select: { id: true },
  });
  const hour = Math.floor(Date.now() / 3600_000);
  const r = await db.job.createMany({ data: due.map((l) => ({ type: "scan.listing", payload: { listingId: l.id }, dedupeKey: `scan.listing:${l.id}:${hour}` })), skipDuplicates: true });
  return r.count;
}

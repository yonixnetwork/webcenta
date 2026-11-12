"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/server/db";
import { rateLimit } from "@/server/rate-limit";
import { clientIp, networkSettings } from "@/server/viewer";
import { dailySalt, visitorHash } from "@/server/analytics/visitor";
import { getCurrentUser } from "@/server/auth/session";
import { notifyAdmins } from "@/server/scanner/monitor";
import { audit } from "@/server/audit";
import { getSection } from "@/server/settings/store";
import { sendEmail } from "@/server/email/send";
import { escapeHtml, layout } from "@/server/email/templates";
import { adminOrigin } from "@/lib/hosts";

export interface ActionState { ok: boolean; message: string }

/** Emails a new support message to the support inbox (Admin → Settings → Notifications), reply-to the visitor. */
async function forwardToSupportInbox(caseId: string, m: { from: string; name: string | null; subject: string; body: string }) {
  const c = await getSection("notifications");
  const valid = (x: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
  const split = (v: string) => v.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(valid);
  const to = [...new Set(split(c.str("supportEmails")).length ? split(c.str("supportEmails")) : split(c.str("adminAlertEmails")))];
  if (!to.length) return;
  const link = `${adminOrigin()}/support/${caseId}`;
  const text = `New message from ${m.name ? `${m.name} <${m.from}>` : m.from}\n\nSubject: ${m.subject}\n\n${m.body}\n\nReply to this email to answer the visitor, or open the case: ${link}`;
  const html = layout(`Support: ${escapeHtml(m.subject)}`, `<p><strong>From:</strong> ${escapeHtml(m.name ? `${m.name} <${m.from}>` : m.from)}</p><p><strong>Subject:</strong> ${escapeHtml(m.subject)}</p><p style="white-space:pre-wrap">${escapeHtml(m.body)}</p><p>Reply to this email to answer the visitor, or <a href="${link}">open the case in the admin portal</a>.</p>`);
  for (const addr of to) await sendEmail({ to: addr, replyTo: m.from, subject: `[Webcenta support] ${m.subject}`, text, html, template: "support-forward" });
}

export async function contactAction(_s: ActionState, f: FormData): Promise<ActionState> {
  if (f.get("website")) return { ok: true, message: "Thanks, we will get back to you." }; // honeypot
  const user = await getCurrentUser();
  const parsed = z.object({ email: z.string().trim().email(), subject: z.string().trim().min(3).max(150), body: z.string().trim().min(10).max(5000) })
    .safeParse({ email: user?.email ?? f.get("email"), subject: f.get("subject"), body: f.get("body") });
  if (!parsed.success) return { ok: false, message: "Please provide a valid email, a subject and a message of at least 10 characters." };
  const h = await headers();
  const who = visitorHash(await dailySalt(), clientIp(h, (await networkSettings()).trustedProxyHops), h.get("user-agent"), "contact");
  if (!(await rateLimit(`contact:${who}`, 5, 3600))) return { ok: false, message: "Too many messages. Please try again later." };
  const sc = await db.supportCase.create({ data: { userId: user?.id ?? null, contactEmail: parsed.data.email.toLowerCase(), subject: parsed.data.subject, messages: { create: { body: parsed.data.body } } } });
  await forwardToSupportInbox(sc.id, { from: parsed.data.email.toLowerCase(), name: user?.name ?? null, subject: parsed.data.subject, body: parsed.data.body }).catch(() => undefined);
  return { ok: true, message: "Thanks! Your message was received. We usually reply within a few working days." };
}

/** Appeal against a moderation decision on a listing (developers) or a removed review (authors). */
export async function appealAction(target: { listingId?: string; reviewId?: string }, _s: ActionState, f: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Please sign in." };
  const statement = z.string().trim().min(20).max(4000).safeParse(f.get("statement"));
  if (!statement.success) return { ok: false, message: "Explain your appeal in at least 20 characters." };
  let listingId: string | null = null;
  if (target.listingId) {
    const l = await db.listing.findUnique({ where: { id: target.listingId }, select: { id: true, developerId: true, status: true } });
    const member = l?.developerId ? await db.developerMember.findUnique({ where: { orgId_userId: { orgId: l.developerId, userId: user.id } } }) : null;
    if (!l || !member || !["REJECTED", "SUSPENDED", "REMOVED"].includes(l.status)) return { ok: false, message: "Nothing to appeal for this listing." };
    listingId = l.id;
  } else if (target.reviewId) {
    const r = await db.review.findFirst({ where: { id: target.reviewId, userId: user.id, status: { in: ["HIDDEN", "REMOVED"] } } });
    if (!r) return { ok: false, message: "Nothing to appeal." };
    listingId = r.listingId;
  }
  const open = await db.appeal.count({ where: { appellantId: user.id, listingId, status: { in: ["OPEN", "IN_REVIEW"] } } });
  if (open) return { ok: false, message: "You already have an open appeal for this item." };
  const last = await db.moderationAction.findFirst({ where: { targetId: target.listingId ?? target.reviewId }, orderBy: { createdAt: "desc" } });
  const a = await db.appeal.create({ data: { appellantId: user.id, listingId, originalActionId: last?.id ?? null, statement: `${target.reviewId ? `[Review ${target.reviewId}] ` : ""}${statement.data}` } });
  await audit({ actorType: "USER", actorUserId: user.id, action: "appeal.create", targetType: "Appeal", targetId: a.id });
  await notifyAdmins("New appeal", "A user submitted an appeal against a moderation decision.", "/appeals");
  return { ok: true, message: "Appeal submitted. A different moderator will review it." };
}

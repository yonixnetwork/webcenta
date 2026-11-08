import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { Card, Field, inputClass } from "@/components/ui/form";
import { StatusPill } from "@/components/portal/table";
import { InlineAction } from "@/components/portal/inline-action";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";
import { revisionMedia } from "@/server/developer/media";
import type { ListingInput } from "@/server/listings/input";
import { approveRevisionAction, decideRevisionAction, rerunChecksAction } from "@/server/actions/admin";

export default async function SubmissionReview({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("listings.moderate");
  const { id } = await params;
  const rev = await db.listingRevision.findUnique({
    where: { id },
    include: {
      listing: { include: { developer: { include: { domainVerifications: true } }, complianceDocs: true, categories: { include: { category: true } } } },
      scans: { orderBy: { createdAt: "desc" }, take: 1, include: { checks: true } }, submittedBy: { select: { email: true } }, reviewedBy: { select: { name: true } },
    },
  });
  if (!rev) notFound();
  const d = rev.data as Partial<ListingInput>;
  const cats = await db.category.findMany({ where: { id: { in: [d.primaryCategoryId, ...(d.categoryIds ?? [])].filter(Boolean) as string[] } }, include: { parent: true } });
  const media = await revisionMedia(d);
  const live = rev.listing;
  const open = ["SUBMITTED", "AUTOMATED_CHECKS", "UNDER_REVIEW"].includes(rev.status);
  const scan = rev.scans[0];
  const changed = (k: keyof ListingInput, liveVal: unknown) => live.publishedAt && JSON.stringify(d[k] ?? null) !== JSON.stringify(liveVal ?? null);
  const row = (label: string, k: keyof ListingInput, liveVal: unknown, children: React.ReactNode) => (
    <div key={label} className={`grid gap-1 border-t border-border py-2 text-sm sm:grid-cols-[160px_1fr] ${changed(k, liveVal) ? "bg-warning-soft/40" : ""}`}>
      <dt className="text-muted">{label}{changed(k, liveVal) && <span className="ml-1 text-xs text-warning">(changed)</span>}</dt><dd className="whitespace-pre-line break-words">{children}</dd>
    </div>
  );
  return (
    <>
      <Link href="/submissions" className="text-sm text-muted hover:text-text">← Submissions</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">{d.name}</h1><StatusPill status={rev.status} /><StatusPill status={live.riskTier} />
        <span className="text-sm text-muted">Revision #{rev.revisionNumber} · {live.publishedAt ? "update to a published listing" : "new listing"} · submitted {formatDate(rev.submittedAt)} by {rev.submittedBy?.email ?? (live.source === "EDITORIAL" ? "Webcenta editors" : "—")}</span>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card>
          <h2 className="mb-2 font-semibold">Proposed content</h2>
          <dl>
            {row("Website", "websiteUrl", live.websiteUrl, <>{d.websiteUrl}</>)}
            {row("Tagline", "tagline", live.tagline ?? undefined, <>{d.tagline ?? "—"}</>)}
            {row("Description", "description", live.description, <>{d.description}</>)}
            {row("Features", "features", live.features, <>{d.features?.join(" · ") || "—"}</>)}
            {row("Publisher", "publisherName", live.publisherName, <>{d.publisherName}</>)}
            {row("Categories", "primaryCategoryId", live.primaryCategoryId, <>{cats.map((c) => `${c.parent ? `${c.parent.name} › ` : ""}${c.name}${c.requiresComplianceDocs || c.parent?.requiresComplianceDocs ? " (licence required)" : ""}${c.isRestricted || c.parent?.isRestricted ? " (restricted)" : ""}`).join(", ")}</>)}
            {row("Pricing", "pricingModel", live.pricingModel, <>{d.pricingModel} {d.pricingDetails ? `— ${d.pricingDetails}` : ""}</>)}
            {row("Age rating", "ageRating", live.ageRating, <>{d.ageRating}</>)}
            {row("Countries", "supportedCountries", live.supportedCountries, <>{d.supportedCountries?.join(", ") || "Worldwide"}</>)}
            {row("Policies", "privacyPolicyUrl", live.privacyPolicyUrl ?? undefined, <>{[d.privacyPolicyUrl, d.termsUrl].filter(Boolean).join("\n") || "None provided"}</>)}
          </dl>
          <div className="mt-3 flex flex-wrap gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- uploaded media preview */}
            {[...media.logo, ...media.screenshots].map((m) => <img key={m.id} src={m.url} alt="" className="h-24 rounded-xl border border-border" />)}
          </div>
          {rev.submitterNotes && <p className="mt-3 rounded-xl bg-surface-2 p-3 text-sm"><strong>Note from submitter:</strong> {rev.submitterNotes}</p>}
        </Card>
        <div className="space-y-4">
          <Card>
            <h2 className="mb-1 font-semibold">Automated checks {scan && <StatusPill status={scan.overallVerdict ?? scan.status} />}</h2>
            {!scan ? <p className="text-sm text-muted">Checks have not run yet (they run within a few minutes of submission).</p> : (
              <>
                <p className="mb-2 text-xs text-muted">{formatDate(scan.createdAt)} · risk score {scan.riskScore ?? "—"}/100 · final URL {scan.finalUrl}</p>
                <ul className="space-y-1 text-sm">{scan.checks.map((c) => <li key={c.id} className="flex gap-2"><StatusPill status={c.verdict} /><span>{c.check.replace(/_/g, " ").toLowerCase()} <span className="text-xs text-subtle">({c.provider})</span>: <span className="text-muted">{c.summary}</span></span></li>)}</ul>
              </>
            )}
            {rev.status === "UNDER_REVIEW" && <div className="mt-3"><InlineAction action={rerunChecksAction.bind(null, rev.id)} label="Re-run checks" /></div>}
          </Card>
          <Card>
            <h2 className="mb-2 font-semibold">Developer</h2>
            {live.developer ? (
              <div className="space-y-1 text-sm">
                <p><Link href={`/developers/${live.developer.id}`} className="font-medium text-brand">{live.developer.displayName}</Link> <StatusPill status={live.developer.verificationLevel} /> <StatusPill status={live.developer.status} /></p>
                <p className="text-muted">Account created {formatDate(live.developer.createdAt)}</p>
                <p className="text-muted">Verified domains: {live.developer.domainVerifications.filter((v) => v.status === "VERIFIED").map((v) => v.domain).join(", ") || "none"}</p>
              </div>
            ) : <p className="text-sm text-muted">Editorial listing. Source: {live.editorialSource ?? "—"}{live.editorialEvidence ? ` · Evidence: ${live.editorialEvidence}` : ""}</p>}
            {live.complianceDocs.length > 0 && <p className="mt-2 text-sm">Compliance documents: {live.complianceDocs.map((c) => `${c.type.toLowerCase()} (${c.decision.toLowerCase()})`).join(", ")} — review on the developer page.</p>}
          </Card>
          {open ? (
            <Card className="space-y-4">
              <h2 className="font-semibold">Decision</h2>
              <ActionForm action={approveRevisionAction.bind(null, rev.id, true)} submitLabel={live.publishedAt ? "Approve update" : "Approve & publish"}>
                <Field label="Note to developer (optional)"><input name="notes" maxLength={500} className={inputClass} /></Field>
              </ActionForm>
              {!live.publishedAt && <ActionForm action={approveRevisionAction.bind(null, rev.id, false)} submitLabel="Approve without publishing" variant="secondary" />}
              <ActionForm action={decideRevisionAction.bind(null, rev.id, "INFO_REQUIRED")} submitLabel="Request more information" variant="secondary">
                <Field label="What is needed?"><textarea name="notes" required rows={2} maxLength={2000} className={inputClass} /></Field>
              </ActionForm>
              <ActionForm action={decideRevisionAction.bind(null, rev.id, "REJECT")} submitLabel="Reject" variant="secondary">
                <Field label="Reason (sent to developer)"><textarea name="notes" required rows={2} maxLength={2000} className={inputClass} /></Field>
              </ActionForm>
            </Card>
          ) : <Card><p className="text-sm">Decided {formatDate(rev.reviewedAt)} by {rev.reviewedBy?.name ?? "the system"}: <StatusPill status={rev.status} /> {rev.decisionNotes}</p><Link href={`/listings/${rev.listingId}`} className="mt-2 inline-block text-sm font-semibold text-brand">Open listing →</Link></Card>}
        </div>
      </div>
    </>
  );
}

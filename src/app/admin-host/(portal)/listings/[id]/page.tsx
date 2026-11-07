import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { buttonClass } from "@/components/ui/button";
import { Card, Field, FormMessage, inputClass } from "@/components/ui/form";
import { DataTable, StatusPill, td } from "@/components/portal/table";
import { InlineAction } from "@/components/portal/inline-action";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";
import { can } from "@/server/admin/permissions";
import { addGeoRestrictionAction, addPlacementAction, publishListingAction, removeGeoRestrictionAction, removePlacementAction, scanNowAction, setListingStatusAction, toggleEditorsPickAction } from "@/server/actions/admin";

export default async function AdminListing({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const admin = await requireAdmin("listings.moderate");
  const { id } = await params;
  const { created } = await searchParams;
  const l = await db.listing.findUnique({
    where: { id },
    include: {
      developer: true, primaryCategory: true, geoRestrictions: true, placements: { orderBy: { startsAt: "desc" } },
      statusHistory: { orderBy: { createdAt: "desc" }, take: 30 }, revisions: { orderBy: { revisionNumber: "desc" }, take: 10 },
      scans: { orderBy: { createdAt: "desc" }, take: 10 }, securityAlerts: { orderBy: { createdAt: "desc" }, take: 10 },
      reports: { orderBy: { createdAt: "desc" }, take: 10 }, _count: { select: { reviews: true, favorites: true } },
    },
  });
  if (!l) notFound();
  const catalog = can(admin.role, "catalog.manage");
  return (
    <>
      <Link href="/listings" className="text-sm text-muted hover:text-text">← Applications</Link>
      {created && <FormMessage tone="success">Editorial listing created. Automated checks run within a few minutes; then approve it from Submissions.</FormMessage>}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">{l.name}</h1><StatusPill status={l.status} /><StatusPill status={l.securityStatus} /><StatusPill status={l.riskTier} />
        {l.status === "PUBLISHED" && <a href={`${process.env.PUBLIC_ORIGIN}/app/${l.slug}`} className="text-sm font-semibold text-brand" target="_blank" rel="noopener noreferrer">Public page ↗</a>}
      </div>
      <p className="text-sm text-muted">{l.websiteUrl} · {l.source === "EDITORIAL" ? `Editorial (credited to ${l.publisherName})` : `by ${l.developer?.displayName}`} · {l._count.reviews} reviews · {l._count.favorites} favourites · last verified {formatDate(l.lastVerifiedAt)} · next scan {formatDate(l.nextScanAt)}</p>
      <div className="flex flex-wrap gap-2">
        <Link href={`/listings/${l.id}/edit`} className={buttonClass("secondary", "sm")}>Edit / correct listing</Link>
        {can(admin.role, "security.manage") && <InlineAction action={scanNowAction.bind(null, l.id)} label="Run security scan now" />}
        {l.status === "APPROVED" && <InlineAction action={publishListingAction.bind(null, l.id)} label="Publish" variant="primary" />}
        {catalog && <InlineAction action={toggleEditorsPickAction.bind(null, l.id)} label={l.isEditorsPick ? "Remove Editor's pick" : "Make Editor's pick"} />}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="font-semibold">Moderation</h2>
          {l.status === "PUBLISHED" || l.status === "APPROVED" ? (
            <>
              <ActionForm action={setListingStatusAction.bind(null, l.id, "SUSPENDED")} submitLabel="Suspend (hide from discovery)" variant="secondary"><Field label="Reason"><input name="reason" required minLength={3} className={inputClass} /></Field></ActionForm>
              <ActionForm action={setListingStatusAction.bind(null, l.id, "REMOVED")} submitLabel="Remove permanently" variant="secondary"><Field label="Reason"><input name="reason" required minLength={3} className={inputClass} /></Field></ActionForm>
            </>
          ) : l.status === "SUSPENDED" || l.status === "REMOVED" ? (
            <ActionForm action={setListingStatusAction.bind(null, l.id, "PUBLISHED")} submitLabel="Reinstate (publish again)"><Field label="Reason / findings"><input name="reason" required minLength={3} className={inputClass} /></Field></ActionForm>
          ) : <p className="text-sm text-muted">Decisions on pending revisions are made in <Link href="/submissions" className="text-brand">Submissions</Link>.</p>}
          {l.securityStatus === "RESTRICTED" && <p className="text-sm text-danger">Restricted by security monitoring — resolve the alert in Security to lift the restriction.</p>}
        </Card>
        <Card className="space-y-3">
          <h2 className="font-semibold">Country restrictions</h2>
          <ul className="flex flex-wrap gap-2 text-sm">{l.geoRestrictions.map((g) => <li key={g.id} className="flex items-center gap-1 rounded-full bg-surface-2 px-2 py-1">{g.countryCode} <span className="text-xs text-muted">({g.reason})</span><form action={removeGeoRestrictionAction.bind(null, g.id)}><button aria-label={`Remove ${g.countryCode}`} className="text-danger">×</button></form></li>)}{l.geoRestrictions.length === 0 && <li className="text-muted">None</li>}</ul>
          <ActionForm action={addGeoRestrictionAction.bind(null, { listingId: l.id })} submitLabel="Hide in country" variant="secondary">
            <div className="grid gap-2 sm:grid-cols-[100px_1fr]"><Field label="Country"><input name="countryCode" required maxLength={2} className={`${inputClass} uppercase`} /></Field><Field label="Legal reason"><input name="reason" required minLength={3} className={inputClass} /></Field></div>
          </ActionForm>
          <p className="text-xs text-subtle">Age rating is {l.ageRating}; change it via “Edit / correct listing”.</p>
        </Card>
        {catalog && (
          <Card className="space-y-3">
            <h2 className="font-semibold">Featured placements (editorial, not sponsored)</h2>
            <ul className="space-y-1 text-sm">{l.placements.map((p) => <li key={p.id} className="flex items-center gap-2">{p.slot.toLowerCase()} {p.isSponsored && <StatusPill status="SPONSORED" />} · {formatDate(p.startsAt)} → {p.endsAt ? formatDate(p.endsAt) : "open"}<form action={removePlacementAction.bind(null, p.id)}><button className="text-xs text-danger">remove</button></form></li>)}</ul>
            <ActionForm action={addPlacementAction.bind(null, l.id)} submitLabel="Add placement" variant="secondary">
              <div className="grid gap-2 sm:grid-cols-3">
                <Field label="Slot"><select name="slot" className={inputClass}><option value="HOME_FEATURED">Home featured</option><option value="HOME_HERO">Home hero</option><option value="CATEGORY_TOP">Category top</option><option value="SEARCH_TOP">Search top</option></select></Field>
                <Field label="Starts"><input type="date" name="startsAt" className={inputClass} /></Field>
                <Field label="Ends (optional)"><input type="date" name="endsAt" className={inputClass} /></Field>
              </div>
            </ActionForm>
          </Card>
        )}
        <Card>
          <h2 className="mb-2 font-semibold">Security alerts & scans</h2>
          <ul className="space-y-1 text-sm">{l.securityAlerts.map((a) => <li key={a.id}><StatusPill status={a.severity} /> <Link href={`/security/alerts/${a.id}`} className="text-brand">{a.title}</Link> <StatusPill status={a.status} /></li>)}</ul>
          <ul className="mt-3 space-y-1 text-xs text-muted">{l.scans.map((s) => <li key={s.id}>{formatDate(s.createdAt)} · {s.trigger.toLowerCase()} · <StatusPill status={s.overallVerdict ?? s.status} /> {s.error ?? ""}</li>)}</ul>
        </Card>
      </div>
      <h2 className="text-lg font-bold">Verification & status history</h2>
      <DataTable head={["When", "From", "To", "By", "Reason"]}>
        {l.statusHistory.map((h) => <tr key={h.id}><td className={td}>{formatDate(h.createdAt)}</td><td className={td}>{h.fromStatus?.toLowerCase() ?? "—"}</td><td className={td}><StatusPill status={h.toStatus} /></td><td className={td}>{h.actorType.toLowerCase()}</td><td className={td}>{h.reason ?? ""}</td></tr>)}
      </DataTable>
      <h2 className="text-lg font-bold">Revisions</h2>
      <DataTable head={["#", "Status", "Submitted", "Notes"]}>
        {l.revisions.map((r) => <tr key={r.id}><td className={td}><Link href={`/submissions/${r.id}`} className="text-brand">#{r.revisionNumber}</Link></td><td className={td}><StatusPill status={r.status} /></td><td className={td}>{formatDate(r.submittedAt)}</td><td className={td}>{r.decisionNotes ?? ""}</td></tr>)}
      </DataTable>
      {l.reports.length > 0 && <p className="text-sm"><Link href={`/reports?listing=${l.id}`} className="text-brand">{l.reports.length} report(s) about this listing →</Link></p>}
    </>
  );
}

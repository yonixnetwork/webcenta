import { ActionForm } from "@/components/ui/action-form";
import { Card, Field, inputClass } from "@/components/ui/form";
import { StatusPill } from "@/components/portal/table";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";
import { decideSponsorshipAction, savePlanAction } from "@/server/actions/admin";

export const metadata = { title: "Monetisation" };

function PlanFields({ p }: { p?: { code: string; name: string; entitlements: unknown; priceCents: number | null; currency: string | null; isActive: boolean } }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <Field label="Code"><input name="code" required defaultValue={p?.code} className={inputClass} /></Field>
      <Field label="Name"><input name="name" required defaultValue={p?.name} className={inputClass} /></Field>
      <Field label="Price (cents, empty = undecided)"><input name="priceCents" type="number" min={0} defaultValue={p?.priceCents ?? ""} className={inputClass} /></Field>
      <Field label="Currency"><input name="currency" maxLength={3} defaultValue={p?.currency ?? ""} className={`${inputClass} uppercase`} /></Field>
      <Field label="Entitlements (JSON)" className="sm:col-span-2"><input name="entitlements" defaultValue={JSON.stringify(p?.entitlements ?? { analyticsHistoryDays: 90 })} className={`${inputClass} font-mono text-xs`} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={p?.isActive} className="size-4 accent-[var(--brand)]" />Shown to developers</label>
    </div>
  );
}

export default async function MonetizationAdmin() {
  await requireAdmin("monetization.manage");
  const [plans, requests] = await Promise.all([db.developerPlan.findMany({ orderBy: { createdAt: "asc" } }), db.sponsorship.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { listing: { select: { name: true, status: true, securityStatus: true } }, org: { select: { displayName: true } } } })]);
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Monetisation</h1>
      <p className="rounded-xl bg-warning-soft p-3 text-sm text-warning">No payment provider is connected. Billing is intentionally inactive until pricing and payment requirements are approved by the owner. Sponsored placements never bypass moderation and are always labelled.</p>
      <h2 className="text-lg font-bold">Sponsored placement requests</h2>
      {requests.length === 0 ? <p className="text-sm text-muted">No requests.</p> : requests.map((r) => (
        <Card key={r.id} className="space-y-2">
          <p className="text-sm"><StatusPill status={r.status} /> <strong>{r.listing.name}</strong> by {r.org.displayName} · {r.slot.toLowerCase()} · listing {r.listing.status.toLowerCase()}/{r.listing.securityStatus.toLowerCase()} · {formatDate(r.createdAt)}</p>
          {r.message && <p className="text-sm text-muted">{r.message}</p>}
          {r.status === "PENDING_REVIEW" && (
            <div className="flex flex-wrap gap-4">
              <ActionForm action={decideSponsorshipAction.bind(null, r.id, true)} submitLabel="Approve placement">
                <div className="grid gap-2 sm:grid-cols-3"><Field label="Starts"><input type="date" name="startsAt" className={inputClass} /></Field><Field label="Ends"><input type="date" name="endsAt" className={inputClass} /></Field><Field label="Notes"><input name="notes" className={inputClass} /></Field></div>
              </ActionForm>
              <ActionForm action={decideSponsorshipAction.bind(null, r.id, false)} submitLabel="Decline" variant="secondary"><Field label="Reason"><input name="notes" className={inputClass} /></Field></ActionForm>
            </div>
          )}
        </Card>
      ))}
      <h2 className="text-lg font-bold">Developer plans</h2>
      {plans.map((p) => <Card key={p.id}><ActionForm action={savePlanAction.bind(null, p.id)} submitLabel="Save plan" variant="secondary"><PlanFields p={p} /></ActionForm></Card>)}
      <Card><h3 className="mb-2 font-semibold">New plan</h3><ActionForm action={savePlanAction.bind(null, null)} submitLabel="Create plan" variant="secondary"><PlanFields /></ActionForm></Card>
    </>
  );
}

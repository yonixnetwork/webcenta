import { ActionForm } from "@/components/ui/action-form";
import { Field, inputClass } from "@/components/ui/form";
import { StatusPill } from "@/components/portal/table";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";
import { moderateReviewAction } from "@/server/actions/admin";

export const metadata = { title: "Reviews" };

export default async function ReviewsAdmin({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  await requireAdmin("content.moderate");
  const { id } = await searchParams;
  const reviews = await db.review.findMany({
    where: id ? { id } : { OR: [{ status: "HELD_FOR_MODERATION" }, { reports: { some: { status: { in: ["OPEN", "IN_REVIEW"] } } } }] },
    orderBy: { createdAt: "asc" }, take: 100,
    include: { listing: { select: { name: true } }, user: { select: { email: true, createdAt: true } }, _count: { select: { reports: true } } },
  });
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Review moderation</h1>
      <p className="text-sm text-muted">Held reviews (anti-spam signals) and reported reviews. Investigate manipulation patterns via the user page (same network, burst posting, duplicates).</p>
      {reviews.length === 0 ? <p className="text-sm text-muted">Nothing to moderate.</p> : (
        <ul className="space-y-3">{reviews.map((r) => (
          <li key={r.id} className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm"><StatusPill status={r.status} /><strong>{r.listing.name}</strong><span>{r.rating}★</span><span className="text-muted">{r.user.email} (joined {formatDate(r.user.createdAt)}) · {r._count.reports} report(s) · signals: {Array.isArray(r.abuseSignals) ? (r.abuseSignals as string[]).join(", ") || "none" : "none"}</span></div>
            {r.title && <p className="mt-1 font-medium">{r.title}</p>}{r.body && <p className="mt-1 text-sm">{r.body}</p>}
            <ActionForm action={moderateReviewAction.bind(null, r.id)} submitLabel="Apply" variant="secondary" className="mt-3 flex flex-wrap items-end gap-2 space-y-0">
              <Field label="Decision"><select name="status" className={inputClass}><option value="PUBLISHED">Publish / restore</option><option value="HIDDEN">Hide</option><option value="REMOVED">Remove (policy violation)</option></select></Field>
              <Field label="Reason"><input name="reason" className={inputClass} /></Field>
            </ActionForm>
          </li>
        ))}</ul>
      )}
    </>
  );
}

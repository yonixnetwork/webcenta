import Link from "next/link";
import { EmptyState } from "@/components/states";
import { ReplyForm } from "@/components/community/review-actions";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { canRole, requireDev } from "@/server/developer/context";
import { replyToReviewAction } from "@/server/actions/user";

export const metadata = { title: "Reviews" };

export default async function DevReviewsPage() {
  const ctx = await requireDev("ANALYST", "/developer/reviews");
  const reviews = await db.review.findMany({
    where: { listing: { developerId: ctx.org.id }, status: "PUBLISHED" }, orderBy: { createdAt: "desc" }, take: 50,
    include: { listing: { select: { name: true, slug: true } }, user: { select: { name: true } }, reply: true },
  });
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Reviews</h1>
      <p className="text-sm text-muted">Reply publicly to reviews; reviewers are notified. To flag a fraudulent or abusive review, use “Report” on the public listing page.</p>
      {reviews.length === 0 ? <EmptyState title="No reviews yet" /> : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Link href={`/app/${r.listing.slug}#review-${r.id}`} className="font-semibold text-brand">{r.listing.name}</Link>
                <span className="text-amber-500">{"★".repeat(r.rating)}</span><span className="text-subtle">{r.user.name} · {formatDate(r.createdAt)}</span>
              </div>
              {r.title && <p className="mt-1 font-medium">{r.title}</p>}
              {r.body && <p className="mt-1 text-sm">{r.body}</p>}
              {r.reply && <p className="mt-2 rounded-xl bg-brand-soft/50 p-2 text-sm"><strong>Your reply:</strong> {r.reply.body}</p>}
              {canRole(ctx.role, "EDITOR") && <ReplyForm action={replyToReviewAction.bind(null, r.id, r.listing.slug)} initial={r.reply?.body} />}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

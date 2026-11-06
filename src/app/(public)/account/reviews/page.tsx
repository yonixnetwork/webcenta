import Link from "next/link";
import { EmptyState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth/session";

export default async function MyReviewsPage() {
  const user = await requireUser("/account/reviews");
  const reviews = await db.review.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, include: { listing: { select: { slug: true, name: true } }, reply: true } });
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">My reviews</h1>
      {reviews.length === 0 ? <EmptyState title="You have not reviewed any apps yet" /> : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/app/${r.listing.slug}#review-${r.id}`} className="font-semibold hover:text-brand">{r.listing.name}</Link>
                <span className="text-sm text-amber-500" aria-label={`${r.rating} out of 5`}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                {r.status !== "PUBLISHED" && <Badge tone="warning">{r.status === "HELD_FOR_MODERATION" ? "Awaiting moderation" : r.status.toLowerCase()}</Badge>}
                {r.reply && <Badge tone="brand">Developer replied</Badge>}
                <span className="ml-auto text-xs text-subtle">{formatDate(r.createdAt)}</span>
              </div>
              {r.body && <p className="mt-2 line-clamp-3 text-sm text-muted">{r.body}</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

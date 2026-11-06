import Link from "next/link";
import { BadgeCheck, Star } from "lucide-react";
import { ReviewForm } from "./review-form";
import { DeleteReviewButton, HelpfulButton, ReplyForm, ReportReviewButton } from "./review-actions";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/labels";
import { MIN_RATINGS_FOR_DISPLAY } from "@/server/catalog/listings";
import { listingReviews } from "@/server/community/reviews";
import { reportReviewAction, replyToReviewAction, submitReviewAction } from "@/server/actions/user";
import type { CurrentUser } from "@/server/auth/session";

export async function ReviewsSection({ listing, user, canReply, isMember, sort, page }: {
  listing: { id: string; slug: string; name: string; ratingAverage: number; ratingCount: number };
  user: CurrentUser | null; canReply: boolean; isMember: boolean; sort: "helpful" | "newest"; page: number;
}) {
  const data = await listingReviews(listing.id, { sort, page, viewerId: user?.id });
  const mine = user ? data.items.find((r) => r.userId === user.id) : undefined;
  const showAvg = listing.ratingCount >= MIN_RATINGS_FOR_DISPLAY;
  const maxCount = Math.max(1, ...data.distribution.map((d) => d.count));
  return (
    <section aria-labelledby="reviews" className="space-y-5">
      <h2 id="reviews" className="text-xl font-bold">Ratings & reviews</h2>
      <div className="grid gap-6 rounded-2xl border border-border bg-surface p-5 sm:grid-cols-[180px_1fr]">
        <div className="text-center sm:text-left">
          <p className="text-4xl font-extrabold">{showAvg ? listing.ratingAverage.toFixed(1) : "—"}</p>
          <p className="text-sm text-muted">{listing.ratingCount} rating{listing.ratingCount === 1 ? "" : "s"}</p>
          {!showAvg && listing.ratingCount > 0 && <p className="mt-1 text-xs text-subtle">Average shown after {MIN_RATINGS_FOR_DISPLAY} ratings.</p>}
        </div>
        <ul className="space-y-1" aria-label="Rating distribution">
          {data.distribution.map((d) => (
            <li key={d.rating} className="flex items-center gap-2 text-xs">
              <span className="w-3">{d.rating}</span><Star className="size-3 fill-amber-400 text-amber-400" aria-hidden />
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-amber-400" style={{ width: `${(d.count / maxCount) * 100}%` }} /></span>
              <span className="w-6 text-right text-muted">{d.count}</span>
            </li>
          ))}
        </ul>
      </div>

      {!user ? (
        <p className="rounded-2xl border border-dashed border-border bg-surface p-5 text-sm text-muted"><Link href={`/signin?next=/app/${listing.slug}%23reviews`} className="font-semibold text-brand underline">Sign in</Link> to rate and review {listing.name}.</p>
      ) : !user.emailVerified ? (
        <p className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted">Confirm your email address to write reviews.</p>
      ) : isMember ? (
        <p className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted">You are a member of this app’s developer organisation, so you can reply to reviews but not review it.</p>
      ) : (
        <ReviewForm action={submitReviewAction.bind(null, listing.slug)} initial={mine ? { rating: mine.rating, title: mine.title, body: mine.body } : undefined} />
      )}

      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted">Sort:</span>
        <Link href={`/app/${listing.slug}?sort=helpful#reviews`} aria-current={sort === "helpful" ? "true" : undefined} className={sort === "helpful" ? "font-semibold text-brand" : "text-muted hover:text-text"}>Most helpful</Link>
        <Link href={`/app/${listing.slug}?sort=newest#reviews`} aria-current={sort === "newest" ? "true" : undefined} className={sort === "newest" ? "font-semibold text-brand" : "text-muted hover:text-text"}>Newest</Link>
      </div>

      {data.items.length === 0 ? <p className="text-sm text-muted">No reviews yet. Be the first to share your experience.</p> : (
        <ul className="space-y-4">
          {data.items.map((r) => (
            <li key={r.id} id={`review-${r.id}`} className="scroll-mt-24 rounded-2xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-amber-500" aria-label={`${r.rating} out of 5 stars`}>{"★".repeat(r.rating)}<span className="text-subtle">{"★".repeat(5 - r.rating)}</span></span>
                {r.title && <strong>{r.title}</strong>}
                {r.status === "HELD_FOR_MODERATION" && <Badge tone="warning">Visible only to you until moderated</Badge>}
              </div>
              <p className="mt-1 text-xs text-subtle">{r.user.name} · {formatDate(r.createdAt)}{r.editedAt ? " · edited" : ""} · Unverified usage</p>
              {r.body && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{r.body}</p>}
              {r.reply && r.reply.status === "PUBLISHED" && (
                <div className="mt-3 rounded-xl border-l-4 border-brand bg-brand-soft/50 p-3 text-sm">
                  <p className="flex items-center gap-1 font-semibold"><BadgeCheck className="size-4 text-brand" aria-hidden /> Response from {r.reply.org.displayName}</p>
                  <p className="mt-1 whitespace-pre-line">{r.reply.body}</p>
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <HelpfulButton reviewId={r.id} slug={listing.slug} count={r.helpfulCount} voted={Array.isArray(r.helpfulVotes) && r.helpfulVotes.length > 0} disabled={!user || r.userId === user.id} />
                {user && r.userId === user.id && <DeleteReviewButton reviewId={r.id} slug={listing.slug} />}
                {user && r.userId !== user.id && <ReportReviewButton action={reportReviewAction.bind(null, r.id)} />}
                {canReply && r.status === "PUBLISHED" && <ReplyForm action={replyToReviewAction.bind(null, r.id, listing.slug)} initial={r.reply?.body} />}
              </div>
            </li>
          ))}
        </ul>
      )}
      {data.pageCount > 1 && (
        <nav aria-label="Review pages" className="flex gap-2">
          {page > 1 && <Link href={`/app/${listing.slug}?sort=${sort}&rpage=${page - 1}#reviews`} className="text-sm font-semibold text-brand">← Previous</Link>}
          {page < data.pageCount && <Link href={`/app/${listing.slug}?sort=${sort}&rpage=${page + 1}#reviews`} className="text-sm font-semibold text-brand">Next →</Link>}
        </nav>
      )}
    </section>
  );
}

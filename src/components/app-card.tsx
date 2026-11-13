import Link from "next/link";
import { BadgeCheck, Star } from "lucide-react";
import type { ListingCard } from "@/server/catalog/listings";
import { PRICING_LABEL, isSampleListing } from "@/lib/labels";
import { AppIcon } from "./app-icon";
import { visitMilestone } from "@/lib/visits";
import { Badge } from "./ui/badge";

export function AppCard({ app, sponsored = false, compact = false }: { app: ListingCard; sponsored?: boolean; compact?: boolean }) {
  const verified = app.developer && app.developer.verificationLevel !== "UNVERIFIED";
  const showRating = app.ratingCount > 0;
  return (
    <Link
      href={`/app/${app.slug}`}
      className="group relative flex h-full flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-pop"
    >
      <div className="flex items-start gap-3">
        <AppIcon name={app.name} storageKey={app.media.find((m) => m.kind === "LOGO")?.asset.storageKey} size={compact ? "sm" : "md"} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-text group-hover:text-brand">{app.name}</h3>
          <p className="flex items-center gap-1 truncate text-xs text-muted">
            <span className="truncate">{app.publisherName}</span>
            {verified && <BadgeCheck className="size-3.5 shrink-0 text-brand" aria-label="Verified developer" />}
          </p>
          {app.primaryCategory && <p className="mt-0.5 truncate text-xs text-subtle">{app.primaryCategory.name}</p>}
        </div>
      </div>
      {!compact && app.tagline && <p className="line-clamp-2 text-sm text-muted">{app.tagline}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        {sponsored && <Badge tone="warning">Sponsored</Badge>}
        {isSampleListing(app.slug) && <Badge tone="outline">Sample</Badge>}
        {app.pricingModel !== "UNKNOWN" && <Badge tone={app.pricingModel === "FREE" ? "success" : "neutral"}>{PRICING_LABEL[app.pricingModel]}</Badge>}
        {visitMilestone(app.visitCount) && <Badge tone="outline">{visitMilestone(app.visitCount)}</Badge>}
        {app.isOpenSource && <Badge tone="brand">Open source</Badge>}
        {showRating && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-muted">
            <Star className="size-3.5 fill-current text-amber-500" aria-hidden />
            <span className="sr-only">Rated </span>{app.ratingAverage.toFixed(1)}<span className="sr-only"> out of 5 from</span> <span className="text-subtle">({app.ratingCount}<span className="sr-only"> review{app.ratingCount === 1 ? "" : "s"}</span>)</span>
          </span>
        )}
      </div>
    </Link>
  );
}

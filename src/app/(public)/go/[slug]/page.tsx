import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, ExternalLink, TriangleAlert } from "lucide-react";
import { AppIcon } from "@/components/app-icon";
import { buttonClass } from "@/components/ui/button";
import { SECURITY_LABEL, isSampleListing } from "@/lib/labels";
import { displayDomain } from "@/lib/url";
import { getPublicListing } from "@/server/catalog/listings";
import { getViewerContext } from "@/server/viewer";

export const metadata: Metadata = { title: "Leaving WebCenter", robots: { index: false, follow: false } };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ from?: string }> };

/** Interstitial shown before any outbound navigation. */
export default async function GoPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { from } = await searchParams;
  const listing = await getPublicListing(await getViewerContext(), slug);
  if (!listing) notFound();
  const domain = displayDomain(listing.websiteUrl);
  const caution = listing.securityStatus === "WARNING" || listing.securityStatus === "UNDER_INVESTIGATION";

  return (
    <div className="mx-auto max-w-lg py-8">
      <div className="rounded-3xl border border-border bg-surface p-6 text-center shadow-pop sm:p-8">
        <div className="flex justify-center"><AppIcon name={listing.name} size="md" /></div>
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight">You’re leaving WebCenter</h1>
        <p className="mt-2 text-muted">You are about to visit <strong className="text-text">{listing.name}</strong> by {listing.publisherName} at</p>
        <p className="mt-3 inline-flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 font-mono text-sm"><ExternalLink className="size-4" aria-hidden />{domain}</p>
        {caution && (
          <p role="alert" className="mt-5 flex gap-2 rounded-xl bg-warning-soft p-3 text-left text-sm text-warning">
            <TriangleAlert className="size-5 shrink-0" aria-hidden /> {SECURITY_LABEL[listing.securityStatus].detail}
          </p>
        )}
        {isSampleListing(listing.slug) && (
          <p className="mt-5 rounded-xl bg-warning-soft p-3 text-sm text-warning">Sample listing — the destination is a reserved “.example” address and will not load.</p>
        )}
        <p className="mt-5 text-left text-xs leading-relaxed text-subtle">
          WebCenter does not operate or control external websites. Check the address before entering passwords or payment details.
          Automated checks reduce risk but cannot guarantee a website is safe.
        </p>
        <form action={`/go/${listing.slug}/continue`} method="post" className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <input type="hidden" name="surface" value={from ?? "detail"} />
          <button type="submit" className={buttonClass("primary", "lg", "flex-1")}>Continue to {domain} <ArrowUpRight className="size-5" aria-hidden /></button>
          <Link href={`/app/${listing.slug}`} className={buttonClass("secondary", "lg", "flex-1")}>Go back</Link>
        </form>
      </div>
    </div>
  );
}

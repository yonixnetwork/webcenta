import Link from "next/link";
import { enumArray, stringArray } from "@/lib/json-arrays";
import { Platform } from "@/generated/prisma/enums";
import { notFound } from "next/navigation";
import { ListingEditor } from "@/components/portal/listing-editor";
import { Card, Field, inputClass } from "@/components/ui/form";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";
import { getAllCategoriesTree } from "@/server/catalog/admin-categories";
import type { ListingInput } from "@/server/listings/input";
import { mediaUrl } from "@/server/storage";
import { adminEditListingAction, adminUploadAction } from "@/server/actions/admin";

export default async function AdminEditListing({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("listings.moderate");
  const { id } = await params;
  const l = await db.listing.findUnique({ where: { id }, include: { categories: true, tags: { include: { tag: true } }, media: { include: { asset: true }, orderBy: { sortOrder: "asc" } } } });
  if (!l) notFound();
  const initial: Partial<ListingInput> = {
    name: l.name, tagline: l.tagline ?? undefined, description: l.description, features: stringArray(l.features), websiteUrl: l.websiteUrl, privacyPolicyUrl: l.privacyPolicyUrl ?? undefined,
    termsUrl: l.termsUrl ?? undefined, supportUrl: l.supportUrl ?? undefined, publisherName: l.publisherName, publisherUrl: l.publisherUrl ?? undefined,
    primaryCategoryId: l.primaryCategoryId ?? undefined, categoryIds: l.categories.map((c) => c.categoryId), tags: l.tags.map((t) => t.tag.name), pricingModel: l.pricingModel,
    pricingDetails: l.pricingDetails ?? undefined, isOpenSource: l.isOpenSource, sourceCodeUrl: l.sourceCodeUrl ?? undefined, platforms: enumArray(l.platforms, Object.values(Platform)), isBrowserBased: l.isBrowserBased,
    isMobileFriendly: l.isMobileFriendly, isPwaInstallable: l.isPwaInstallable, ageRating: l.ageRating, supportedCountries: stringArray(l.supportedCountries), languages: stringArray(l.languages),
  };
  const logo = l.media.filter((m) => m.kind === "LOGO").map((m) => ({ id: m.assetId, url: mediaUrl(m.asset.storageKey) }));
  const shots = l.media.filter((m) => m.kind !== "LOGO").map((m) => ({ id: m.assetId, url: mediaUrl(m.asset.storageKey) }));
  return (
    <>
      <Link href={`/listings/${id}`} className="text-sm text-muted hover:text-text">← {l.name}</Link>
      <h1 className="text-2xl font-extrabold tracking-tight">Correct listing</h1>
      <ListingEditor action={adminEditListingAction.bind(null, id)} upload={adminUploadAction} tree={await getAllCategoriesTree()} initial={initial} media={{ logo, screenshots: shots }} submitLabel="Save correction"
        extra={<Card><Field label="Reason for the correction (recorded in history and audit log)"><input name="editReason" required minLength={3} maxLength={300} className={inputClass} /></Field></Card>} />
    </>
  );
}

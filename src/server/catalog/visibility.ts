import type { Prisma } from "@/generated/prisma/client";
import type { AgeRating } from "@/generated/prisma/enums";
import type { ViewerContext } from "@/server/viewer";

/**
 * THE public visibility rule. Every public query (pages, search, rails,
 * alternatives, sitemap, outbound redirect) must include this filter.
 * See docs/ARCHITECTURE.md §5.5.
 */
export const AGE_ORDER: AgeRating[] = ["ALL_AGES", "AGE_13_PLUS", "AGE_16_PLUS", "AGE_18_PLUS"];

export function allowedAgeRatings(max: AgeRating): AgeRating[] {
  return AGE_ORDER.slice(0, AGE_ORDER.indexOf(max) + 1);
}

/** A category (or its parent) that hides every listing attached to it. */
const blockedCategory = (ctx: ViewerContext): Prisma.CategoryWhereInput => {
  const geo: Prisma.CategoryWhereInput[] = ctx.country
    ? [{ geoRestrictions: { some: { countryCode: ctx.country } } }]
    : ctx.unknownCountryPolicy === "deny"
      ? [{ geoRestrictions: { some: {} } }]
      : [];
  const self: Prisma.CategoryWhereInput[] = [{ isEnabled: false }, { isRestricted: true }, ...geo];
  return { OR: [...self, { parent: { OR: self } }] };
};

export function publicListingWhere(ctx: ViewerContext): Prisma.ListingWhereInput {
  const listingGeo: Prisma.ListingWhereInput = ctx.country
    ? { geoRestrictions: { none: { countryCode: ctx.country } } }
    : ctx.unknownCountryPolicy === "deny"
      ? { geoRestrictions: { none: {} } }
      : {};

  return {
    status: "PUBLISHED",
    deletedAt: null,
    securityStatus: { not: "RESTRICTED" },
    ageRating: { in: allowedAgeRatings(ctx.maxAgeRating) },
    primaryCategoryId: { not: null },
    primaryCategory: { NOT: blockedCategory(ctx) },
    categories: { none: { category: blockedCategory(ctx) } },
    ...listingGeo,
  };
}

/** Categories that may be shown publicly (browsing, navigation, sitemap). */
export function publicCategoryWhere(): Prisma.CategoryWhereInput {
  return {
    isEnabled: true,
    isRestricted: false,
    mergedIntoId: null,
    OR: [{ parentId: null }, { parent: { isEnabled: true, isRestricted: false } }],
  };
}

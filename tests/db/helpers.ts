import type { ViewerContext } from "@/server/viewer";

export const anon = (over: Partial<ViewerContext> = {}): ViewerContext => ({
  country: "US", maxAgeRating: "AGE_16_PLUS", unknownCountryPolicy: "deny", ...over,
});

export const HIDDEN = ["sample-hidden-exchange", "sample-pending-review", "sample-security-restricted"];

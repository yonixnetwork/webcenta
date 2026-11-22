import { getSection } from "@/server/settings/store";

/**
 * Brand-safety categories (Admin → Settings → Ad content policy). Each maps to category-slug
 * patterns: a page about a blocked category (an app listed in it) shows no ads at all, so ads
 * are never placed next to that content and providers get no contextual signal for it.
 * Which creative is served is still the provider's decision — see docs/international-expansion/advertising-audit.md.
 */
export const AD_POLICY_CATEGORIES = [
  { key: "blockGambling", label: "Gambling and casinos", pattern: /gambl|casino|poker|lotter|slot-machine/ },
  { key: "blockBetting", label: "Sports betting", pattern: /betting|sportsbook|wager/ },
  { key: "blockAdult", label: "Adult and sexual content", pattern: /^adult|nsfw|erotic|sexual/ },
  { key: "blockDating", label: "Dating", pattern: /dating/ },
  { key: "blockCrypto", label: "Crypto, forex and high-risk finance", pattern: /crypto|forex|defi|nft|trading-bot|binary-option|cfd/ },
  { key: "blockDownloads", label: "Misleading downloads", pattern: /^$/ },
  { key: "blockScareware", label: "Fake system warnings", pattern: /^$/ },
  { key: "blockMalware", label: "Malware, phishing and fraud", pattern: /^$/ },
  { key: "blockWeapons", label: "Weapons, drugs, tobacco and alcohol", pattern: /weapon|firearm|cannabis|vape|tobacco|alcohol|drug/ },
  { key: "blockPolitical", label: "Political and religious", pattern: /politic|religio/ },
] as const;

export interface AdContentContext {
  /** Slugs of the categories the page is about (an app's categories and their parents). */
  categorySlugs?: string[];
  /** The page shows 18+ content. */
  adult?: boolean;
}

/** False when the page's own content falls in a blocked category (or is 18+). */
export async function adsAllowedForContent(ctx: AdContentContext | undefined): Promise<boolean> {
  if (!ctx) return true;
  if (ctx.adult) return false;
  const s = await getSection("adPolicy");
  const slugs = ctx.categorySlugs ?? [];
  return !AD_POLICY_CATEGORIES.some((c) => s.bool(c.key) && slugs.some((slug) => c.pattern.test(slug)));
}

export async function blockedPolicyLabels(): Promise<string[]> {
  const s = await getSection("adPolicy");
  return AD_POLICY_CATEGORIES.filter((c) => s.bool(c.key)).map((c) => c.label);
}

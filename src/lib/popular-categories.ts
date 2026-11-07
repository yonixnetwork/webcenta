/**
 * A short, static list of broad categories linked from error pages. Static on
 * purpose: error pages must render even when the database is unreachable.
 * Slugs are checked against the seeded taxonomy by a unit test.
 */
export const POPULAR_CATEGORIES: ReadonlyArray<{ slug: string; name: string; icon: string }> = [
  { slug: "ai", name: "AI & Artificial Intelligence", icon: "Sparkles" },
  { slug: "productivity", name: "Productivity", icon: "SquareCheckBig" },
  { slug: "developer-tools", name: "Developer Tools", icon: "Wrench" },
  { slug: "education", name: "Education", icon: "GraduationCap" },
  { slug: "finance", name: "Finance & Accounting", icon: "Wallet" },
  { slug: "games", name: "Games", icon: "Gamepad2" },
  { slug: "shopping", name: "Shopping", icon: "ShoppingBag" },
  { slug: "communication", name: "Communication", icon: "MessageCircle" },
];

import type { AgeRating, RiskTier } from "@/generated/prisma/enums";
import { slugify } from "@/lib/url";

/**
 * Webcenta category taxonomy — real platform configuration (not fake data).
 * Seeded idempotently by `npm run db:seed`; administrators manage it afterwards
 * (Phase 3). Icons are lucide-react icon names.
 *
 * Flags:
 *  - restricted: hidden from public browsing until legal review enables the
 *    category for specific markets (docs/ROADMAP.md D6).
 *  - manualReview: automated approval never applies.
 *  - complianceDocs: licence / registration evidence required.
 * A child inherits the stricter of its own and its parent's settings at evaluation time.
 */
export interface TaxonomyNode {
  slug: string;
  name: string;
  icon: string;
  description?: string;
  riskTier?: RiskTier;
  ageRating?: AgeRating;
  restricted?: boolean;
  manualReview?: boolean;
  complianceDocs?: boolean;
  children?: TaxonomyNode[];
}

type Opts = Omit<TaxonomyNode, "slug" | "name" | "icon" | "children">;
type Child = string | [name: string, opts: Opts & { icon?: string }];

function node(slug: string, name: string, icon: string, opts: Opts, children: Child[] = []): TaxonomyNode {
  return {
    slug,
    name,
    icon,
    ...opts,
    children: children.map((c) => {
      const [childName, childOpts] = typeof c === "string" ? [c, {} as Opts & { icon?: string }] : c;
      const base = slugify(childName);
      return {
        slug: base.startsWith(`${slug}-`) || base === slug ? base : `${slug}-${base}`,
        name: childName,
        icon: childOpts.icon ?? icon,
        ...childOpts,
      };
    }),
  };
}

const HIGH_FIN: Opts = { riskTier: "HIGH", manualReview: true, complianceDocs: true };
const RESTRICTED_18: Opts = { riskTier: "HIGH", ageRating: "AGE_18_PLUS", restricted: true, manualReview: true, complianceDocs: true };
/** Visible to adults only (18+), every listing reviewed by a moderator, licence evidence where it applies. */
const ADULT_FIN: Opts = { riskTier: "HIGH", ageRating: "AGE_18_PLUS", manualReview: true, complianceDocs: true };

export const TAXONOMY: TaxonomyNode[] = [
  node("ai", "AI & Artificial Intelligence", "Sparkles", { description: "AI assistants, generators, agents and machine-learning tools." }, [
    "AI chatbots", "Image generation", "Video generation", "Music generation", "Coding assistants",
    "AI agents", "Voice tools", "Writing assistants", "AI search", "AI automation",
  ]),
  node("business", "Business", "Briefcase", {}, ["CRM", "Project management", "HR & recruiting", "Invoicing", "Customer support", "Legal tools", "E-signature"]),
  node("productivity", "Productivity", "SquareCheckBig", {}, ["Notes", "Task managers", "Calendars", "Time tracking", "Documents", "Whiteboards", "Focus tools"]),
  node("developer-tools", "Developer Tools", "Wrench", {}, ["APIs", "Testing", "Monitoring", "CI/CD", "Databases", "Documentation", "Design to code"]),
  node("programming", "Programming", "Code", {}, ["Online IDEs", "Learn to code", "Code playgrounds", "Package registries", "Code search"]),
  node("education", "Education", "GraduationCap", {}, ["Online courses", "Language learning", "Tutoring", "Exam preparation", "Reference", "Teaching tools"]),
  node("science", "Science & Research", "FlaskConical", {}, ["Research papers", "Citation managers", "Data repositories", "Scientific calculators", "Astronomy", "Lab tools"]),
  node("cryptocurrency", "Cryptocurrency", "Bitcoin", { riskTier: "MEDIUM", manualReview: true, description: "Wallets, exchanges, DEX screeners, explorers and research tools that work in the browser." }, [
    ["Exchanges", ADULT_FIN],
    ["Decentralized exchanges (DEX)", { ...ADULT_FIN, icon: "ArrowLeftRight" }],
    ["DEX screeners", { riskTier: "MEDIUM", manualReview: true, icon: "Scan" }],
    ["Wallets", { riskTier: "HIGH", manualReview: true, icon: "Wallet" }],
    ["DeFi", ADULT_FIN],
    ["NFT platforms", { riskTier: "HIGH", manualReview: true }],
    "Blockchain explorers",
    ["Token scanners", { riskTier: "MEDIUM", manualReview: true, icon: "Scan" }],
    "On-chain analytics",
    ["Token launchpads", { ...HIGH_FIN, restricted: true, ageRating: "AGE_18_PLUS" }],
    ["Trading bots", ADULT_FIN],
    "Analytics", "Portfolio tracking", "Research tools", "Crypto news", "Crypto tools",
  ]),
  node("blockchain-web3", "Blockchain & Web3", "Blocks", { riskTier: "MEDIUM", manualReview: true }, ["dApps", "Developer platforms", "Decentralized storage", "DAOs", "Identity"]),
  node("forex", "Forex", "ChartCandlestick", { ...ADULT_FIN, description: "Foreign-exchange brokers and trading tools. Brokers need licence verification." }, [
    "Brokers", "Trading platforms", "Signals", "Economic calendars", "Education",
    ["Forex tools", { riskTier: "MEDIUM", manualReview: true, complianceDocs: false }],
    ["Currency converters", { riskTier: "LOW", manualReview: false, complianceDocs: false, ageRating: "ALL_AGES" }],
    ["Position size calculators", { riskTier: "MEDIUM", manualReview: true, complianceDocs: false }],
  ]),
  node("trading", "Trading", "ChartLine", { riskTier: "MEDIUM", manualReview: true, description: "Charting, screeners, journals and research for stocks, crypto and forex traders." }, [
    "Charting", "Screeners", "Trading journals", "Backtesting", "Market news", "Economic calendars",
    ["Copy trading", ADULT_FIN], ["Prop firms", ADULT_FIN], ["Trading signals", ADULT_FIN],
  ]),
  node("finance", "Finance & Accounting", "Calculator", { riskTier: "MEDIUM" }, ["Accounting", "Budgeting", "Tax", "Payroll", "Expense tracking", "Calculators"]),
  node("banking-fintech", "Banking & Fintech", "Landmark", HIGH_FIN, ["Digital banks", "Payments", "Money transfer", ["Lending", { ...HIGH_FIN, restricted: true }], "Business banking"]),
  node("investing", "Investing", "TrendingUp", { ...HIGH_FIN, ageRating: "AGE_18_PLUS" }, ["Brokerages", "Robo-advisors", "Market data", "Stock screeners", "Portfolio tools", "Financial news"]),
  node("sports", "Sports", "Trophy", {}, [
    "Live scores", "Sports news", "Sports analytics", "Fantasy sports",
    ["Betting platforms", { ...RESTRICTED_18 }],
    ["Prediction platforms", { ...RESTRICTED_18 }],
  ]),
  node("betting-gambling", "Betting & Gambling", "Dices", { ...RESTRICTED_18, description: "Licensed betting and gambling services only. Requires licence verification." }, [
    "Sportsbooks", "Casinos", "Poker", "Lotteries", "Prediction markets", "Responsible gambling",
  ]),
  node("games", "Games", "Gamepad2", {}, ["Browser games", "Multiplayer", "Puzzle", "Strategy", "Game platforms", "Game tools", "Esports"]),
  node("entertainment", "Entertainment", "Clapperboard", {}, ["Movies & TV info", "Comics", "Humor", "Events & tickets", "Fan communities"]),
  node("video-streaming", "Video & Streaming", "MonitorPlay", {}, ["Video platforms", "Live streaming", "Video editing", "Screen recording", "Podcasts"]),
  node("adult-entertainment", "Adult Content", "ShieldBan", { riskTier: "HIGH", ageRating: "AGE_18_PLUS", manualReview: true, description: "Legal adult services. Shown only to signed-in users who confirmed they are adults." }, ["Entertainment", "Adult dating", "Sexual health"]),
  node("art-design", "Graphics & Design", "Palette", {}, ["Graphic design", "Art & drawing", "UI/UX design", "Illustration", "Icons & fonts", "Color tools", "3D design", "Mockups"]),
  node("photography", "Photo & Video", "Camera", {}, ["Photo editing", "Video editors", "Stock photos", "Portfolios", "Image hosting", "Background removal"]),
  node("books-reading", "Books & Reading", "BookOpen", {}, ["E-books", "Audiobooks", "Book discovery", "Read-later", "Writing platforms"]),
  node("music-audio", "Music & Audio", "Headphones", {}, ["Music streaming", "Music production", "Audio editing", "Radio", "Sound effects"]),
  node("communication", "Communication", "MessageCircle", { riskTier: "MEDIUM" }, ["Messaging", "Video calls", "Email", "Team chat", "Translation"]),
  node("social-networks", "Social Networks", "Users", { ageRating: "AGE_13_PLUS", riskTier: "MEDIUM" }, ["Social media", "Professional networks", "Microblogging", "Social tools"]),
  node("community", "Community", "UsersRound", { ageRating: "AGE_13_PLUS" }, ["Forums", "Q&A", "Groups", "Volunteering"]),
  node("dating", "Dating", "Heart", { riskTier: "MEDIUM", ageRating: "AGE_18_PLUS", manualReview: true }, ["Dating apps", "Matchmaking", "Dating safety"]),
  node("shopping", "Shopping", "ShoppingBag", {}, ["Marketplaces", "Price comparison", "Deals & coupons", "Fashion", "Electronics", "Second-hand"]),
  node("ecommerce", "E-commerce", "Store", {}, ["Store builders", "Payments for stores", "Inventory", "Shipping", "Dropshipping"]),
  node("food-drink", "Food & Drink", "UtensilsCrossed", {}, ["Recipes", "Food delivery", "Restaurant discovery", "Meal planning", "Nutrition"]),
  node("health-fitness", "Health & Fitness", "Dumbbell", { riskTier: "MEDIUM" }, ["Workouts", "Running", "Meditation", "Sleep", "Nutrition tracking"]),
  node("medical", "Medical", "Stethoscope", { ...HIGH_FIN, description: "Healthcare services and medical information. Enhanced verification applies." }, [
    "Telehealth", "Symptom information", "Pharmacies", "Mental health", "Medical records",
  ]),
  node("parenting", "Parenting", "Baby", { riskTier: "MEDIUM" }, ["Pregnancy", "Baby care", "Family organisation", "Childcare"]),
  node("children-family", "Kids & Family", "ToyBrick", { riskTier: "HIGH", manualReview: true, description: "Services for children. Enhanced checks for children's data protection." }, [
    "Kids learning", "Kids games", "Family safety", "Parental controls",
  ]),
  node("lifestyle", "Lifestyle", "Coffee", {}, ["Hobbies", "Fashion & beauty", "Home & garden", "Pets", "Spirituality"]),
  node("household", "Household", "House", {}, ["Home services", "Utilities management", "Moving", "Real estate", "Smart home"]),
  node("travel", "Travel", "Plane", {}, ["Flights", "Hotels & stays", "Trip planning", "Travel guides", "Visas & documents"]),
  node("transport-automotive", "Transport & Automotive", "Car", {}, ["Ride hailing", "Public transport", "Car marketplaces", "EV charging", "Vehicle tools"]),
  node("news-magazines", "News & Magazines", "Newspaper", {}, ["World news", "Tech news", "Business news", "Local news", "Newsletters", "Fact-checking"]),
  node("marketing-seo", "Marketing & SEO", "Megaphone", {}, ["SEO tools", "Email marketing", "Social media management", "Analytics", "Advertising", "Surveys & forms"]),
  node("website-builders", "Website Builders", "LayoutTemplate", {}, ["Site builders", "Blogging", "Landing pages", "Portfolio builders", "No-code"]),
  node("hosting-cloud", "Hosting & Cloud", "Cloud", {}, ["Web hosting", "Cloud platforms", "Domains", "CDN", "Storage & backup"]),
  node("cybersecurity", "Cybersecurity", "ShieldCheck", { riskTier: "MEDIUM", manualReview: true }, ["Password managers", "VPN", "Security scanners", "Privacy tools", "Threat intelligence"]),
  node("data-analysis", "Data Analysis", "ChartColumn", {}, ["BI & dashboards", "Spreadsheets", "Data visualization", "Data pipelines", "Statistics"]),
  node("automation", "Automation", "Workflow", {}, ["Workflow automation", "Integrations", "Web scraping", "Scheduling", "RPA"]),
  node("utilities-converters", "Utilities & Converters", "Settings2", {}, ["File converters", "PDF tools", "Unit converters", "Image compression", "QR codes", "Generators"]),
  node("weather", "Weather", "CloudSun", {}, ["Forecasts", "Radar & maps", "Air quality", "Climate data"]),
  node("maps-navigation", "Maps & Navigation", "Map", {}, ["Maps", "Route planning", "Location sharing", "Geodata"]),
  node("browser-tools", "Browser Tools", "Globe", { riskTier: "MEDIUM", manualReview: true }, ["Extensions", "Bookmarks", "Tab managers", "Ad blockers", "Browser testing"]),
  node("reference", "Reference", "Library", {}, ["Dictionaries", "Encyclopedias", "Translation", "Thesauruses", "Libraries & archives", "How-to guides"]),
  node("beauty", "Beauty", "Brush", {}, ["Makeup", "Skincare", "Hair", "Salons & booking", "Virtual try-on"]),
  node("comics", "Comics", "BookImage", {}, ["Webcomics", "Manga", "Comic creation"]),
  node("ar-vr", "AR & VR", "Glasses", {}, ["WebXR experiences", "3D viewers", "Virtual tours", "AR try-on"]),
  node("events", "Events", "Ticket", {}, ["Event discovery", "Ticketing", "Event planning", "Conferences"]),
  node("personalization", "Personalisation", "Sparkle", {}, ["Wallpapers", "Themes", "Avatars", "Fonts"]),
  node("libraries-demo", "Libraries & Demo", "Package", {}, ["Open-source libraries", "Demos", "Showcases", "Templates"]),
  node("other", "Other Digital Services", "LayoutGrid", {}, []),
];

/** Flattened list with parent slugs, in display order. */
export function flattenTaxonomy(nodes: TaxonomyNode[] = TAXONOMY) {
  const out: Array<TaxonomyNode & { parentSlug: string | null; sortOrder: number }> = [];
  nodes.forEach((n, i) => {
    const pos = TOP_LEVEL_ORDER.indexOf(n.slug);
    out.push({ ...n, parentSlug: null, sortOrder: pos >= 0 ? pos : TOP_LEVEL_ORDER.length + i });
    (n.children ?? []).forEach((c, j) => out.push({ ...c, parentSlug: n.slug, sortOrder: j }));
  });
  return out;
}

/**
 * One emoji per top-level category, used sparingly as a friendly visual next to
 * the category name (category index and category headers). Lucide icons remain
 * the primary iconography; administrators can change or clear these.
 */
export const CATEGORY_EMOJI: Record<string, string> = {
  ai: "🤖", business: "💼", productivity: "✅", "developer-tools": "🛠️", programming: "💻",
  education: "🎓", science: "🔬", cryptocurrency: "🪙", "blockchain-web3": "⛓️", forex: "💱",
  finance: "💰", "banking-fintech": "🏦", investing: "📈", sports: "⚽", "betting-gambling": "🎲",
  games: "🎮", entertainment: "🎭", "video-streaming": "📺", "adult-entertainment": "🔞",
  "art-design": "🎨", photography: "📷", "books-reading": "📚", "music-audio": "🎵",
  communication: "💬", "social-networks": "🌐", community: "👥", dating: "💞", shopping: "🛍️",
  ecommerce: "🛒", "food-drink": "🍽️", "health-fitness": "💪", medical: "🩺", parenting: "🍼",
  "children-family": "👨‍👩‍👧", lifestyle: "🌿", household: "🏠", travel: "✈️",
  "transport-automotive": "🚗", "news-magazines": "📰", "marketing-seo": "📣",
  "website-builders": "🧱", "hosting-cloud": "☁️", cybersecurity: "🔐", "data-analysis": "📊",
  automation: "⚙️", "utilities-converters": "🧰", weather: "⛅", "maps-navigation": "🗺️",
  "browser-tools": "🧭", other: "🗂️", reference: "📖", beauty: "💄", comics: "💥", "ar-vr": "🥽", events: "🎟️",
  personalization: "✨", "libraries-demo": "📦", trading: "💹",
};

/**
 * Display order of the top-level categories (store-style: everyday categories first).
 * Applied to new installations and once to existing ones by taxonomy revision 2.
 */
export const TOP_LEVEL_ORDER = [
  "ai", "productivity", "business", "education", "games", "entertainment", "social-networks", "communication",
  "photography", "video-streaming", "music-audio", "books-reading", "reference", "news-magazines", "shopping",
  "food-drink", "health-fitness", "medical", "lifestyle", "beauty", "travel", "maps-navigation", "weather", "sports",
  "finance", "banking-fintech", "investing", "trading", "cryptocurrency", "blockchain-web3", "forex",
  "utilities-converters", "developer-tools", "programming", "art-design", "ar-vr", "comics", "dating", "parenting",
  "children-family", "events", "household", "transport-automotive", "personalization", "libraries-demo", "science",
  "marketing-seo", "website-builders", "hosting-cloud", "cybersecurity", "data-analysis", "automation",
  "browser-tools", "community", "ecommerce", "betting-gambling", "adult-entertainment", "other",
];

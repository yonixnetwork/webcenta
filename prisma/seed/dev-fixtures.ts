/**
 * DEVELOPMENT / TEST FIXTURES — FICTIONAL DATA.
 * Every listing here is invented, uses the reserved ".example" TLD (RFC 2606),
 * has a slug starting with "sample-", and has NO ratings, reviews, scores or
 * statistics. Never load into production (scripts/seed.ts enforces this).
 */
import type { AgeRating, ListingStatus, Platform, PricingModel, SecurityStatus } from "../../src/generated/prisma/enums";

export interface FixtureListing {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  features: string[];
  primary: string;
  extraCategories?: string[];
  tags: string[];
  pricing: PricingModel;
  openSource?: boolean;
  platforms?: Platform[];
  mobileFriendly?: boolean;
  pwa?: boolean;
  age?: AgeRating;
  editorsPick?: boolean;
  status?: ListingStatus;
  securityStatus?: SecurityStatus;
  updatedDaysAfterPublish?: number;
  publishedDaysAgo: number;
  geoBlocked?: string[];
  supportedCountries?: string[];
}

const NOTE = "Fictional sample listing for development and testing only. ";

export const FIXTURE_LISTINGS: FixtureListing[] = [
  { slug: "sample-lumen-notes", name: "Lumen Notes", tagline: "Fast, linked notes in your browser",
    description: NOTE + "A notes app with backlinks, daily journals and Markdown export.",
    features: ["Backlinks", "Markdown export", "Offline mode", "Daily notes"], primary: "productivity-notes",
    tags: ["notes", "markdown", "knowledge base"], pricing: "FREEMIUM", platforms: ["WEB", "WINDOWS", "MACOS"],
    mobileFriendly: true, pwa: true, editorsPick: true, publishedDaysAgo: 40, updatedDaysAfterPublish: 30 },
  { slug: "sample-quillpad", name: "Quillpad", tagline: "Open-source Markdown notebook",
    description: NOTE + "A minimal open-source notebook that stores notes as plain Markdown files.",
    features: ["Plain files", "Self-hostable", "Tags"], primary: "productivity-notes", tags: ["notes", "markdown", "open source"],
    pricing: "FREE", openSource: true, mobileFriendly: true, publishedDaysAgo: 25 },
  { slug: "sample-taskforge", name: "TaskForge", tagline: "Kanban boards for small teams",
    description: NOTE + "Boards, lists and recurring tasks for teams of up to 50 people.",
    features: ["Kanban boards", "Recurring tasks", "Team permissions"], primary: "productivity-task-managers",
    extraCategories: ["business-project-management"], tags: ["tasks", "kanban", "teams"], pricing: "SUBSCRIPTION",
    platforms: ["WEB", "ANDROID", "IOS"], mobileFriendly: true, publishedDaysAgo: 12 },
  { slug: "sample-orbit-chat", name: "Orbit Chat", tagline: "A conversational AI assistant",
    description: NOTE + "A general-purpose chatbot for drafting, summarising and brainstorming.",
    features: ["Document summaries", "Multi-language", "Conversation history"], primary: "ai-chatbots",
    extraCategories: ["ai-writing-assistants"], tags: ["chatbot", "writing", "assistant"], pricing: "FREEMIUM",
    mobileFriendly: true, pwa: true, editorsPick: true, publishedDaysAgo: 8 },
  { slug: "sample-pixel-dream", name: "Pixel Dream", tagline: "Generate images from text prompts",
    description: NOTE + "Create illustrations and concept art from text descriptions.",
    features: ["Text-to-image", "Style presets", "Upscaling"], primary: "ai-image-generation",
    extraCategories: ["art-design-illustration"], tags: ["image generation", "art"], pricing: "SUBSCRIPTION", publishedDaysAgo: 5 },
  { slug: "sample-codewisp", name: "CodeWisp", tagline: "Coding assistant for your editor",
    description: NOTE + "Explains code, suggests completions and writes tests.",
    features: ["Code completion", "Test generation", "Code explanation"], primary: "ai-coding-assistants",
    extraCategories: ["developer-tools-testing"], tags: ["coding", "assistant", "testing"], pricing: "PAID",
    platforms: ["WEB", "BROWSER_EXTENSION"], publishedDaysAgo: 18 },
  { slug: "sample-openpilot-code", name: "OpenPilot Code", tagline: "Open-source code completion",
    description: NOTE + "A community-maintained, open-source code completion tool.",
    features: ["Code completion", "Self-hostable"], primary: "ai-coding-assistants", tags: ["coding", "open source"],
    pricing: "FREE", openSource: true, publishedDaysAgo: 30 },
  { slug: "sample-hookbin", name: "Hookbin", tagline: "Inspect and debug webhooks",
    description: NOTE + "Capture HTTP requests and replay them while you build integrations.",
    features: ["Request inspector", "Replay", "Custom responses"], primary: "developer-tools-apis",
    tags: ["webhooks", "api", "debugging"], pricing: "FREEMIUM", publishedDaysAgo: 60, updatedDaysAfterPublish: 45 },
  { slug: "sample-lingo-leaf", name: "LingoLeaf", tagline: "Learn a language ten minutes a day",
    description: NOTE + "Short daily lessons with spaced repetition.",
    features: ["Spaced repetition", "Speaking practice", "30 languages"], primary: "education-language-learning",
    tags: ["languages", "learning"], pricing: "FREEMIUM", mobileFriendly: true, pwa: true, editorsPick: true, publishedDaysAgo: 20 },
  { slug: "sample-starfield-quiz", name: "Starfield Quiz", tagline: "Astronomy quizzes for curious minds",
    description: NOTE + "Interactive quizzes about planets, stars and space missions.",
    features: ["Quizzes", "Sky maps"], primary: "science-astronomy", extraCategories: ["education-reference"],
    tags: ["astronomy", "quiz"], pricing: "FREE", mobileFriendly: true, publishedDaysAgo: 3 },
  { slug: "sample-tile-tactics", name: "Tile Tactics", tagline: "A browser puzzle game",
    description: NOTE + "Slide tiles to solve over 200 handcrafted puzzles.",
    features: ["200 levels", "No install"], primary: "games-browser-games", extraCategories: ["games-puzzle"],
    tags: ["puzzle", "browser game"], pricing: "FREE", mobileFriendly: true, age: "ALL_AGES", publishedDaysAgo: 15 },
  { slug: "sample-paperfold-pdf", name: "Paperfold PDF", tagline: "Merge, split and compress PDFs",
    description: NOTE + "PDF utilities that run in your browser.",
    features: ["Merge", "Split", "Compress", "Sign"], primary: "utilities-converters-pdf-tools",
    tags: ["pdf", "converter"], pricing: "FREE", mobileFriendly: true, publishedDaysAgo: 50 },
  { slug: "sample-skyline-weather", name: "Skyline Weather", tagline: "Hyperlocal forecasts",
    description: NOTE + "Hour-by-hour forecasts and rain radar.",
    features: ["Hourly forecast", "Rain radar", "Alerts"], primary: "weather-forecasts", tags: ["weather", "forecast"],
    pricing: "FREE", mobileFriendly: true, pwa: true, publishedDaysAgo: 9 },
  { slug: "sample-coinledger-view", name: "CoinLedger View", tagline: "Track a crypto portfolio (read-only)",
    description: NOTE + "Read-only portfolio tracking. Does not hold funds or execute trades.",
    features: ["Read-only tracking", "Price alerts"], primary: "cryptocurrency-portfolio-tracking",
    tags: ["crypto", "portfolio"], pricing: "FREEMIUM", age: "AGE_16_PLUS", publishedDaysAgo: 14 },
  // ---- Fixtures that must NOT be publicly visible (used by tests) ----
  { slug: "sample-hidden-exchange", name: "Hidden Exchange", tagline: "Restricted-category fixture",
    description: NOTE + "In a restricted category (crypto exchanges) — must stay hidden.", features: [],
    primary: "cryptocurrency-exchanges", tags: ["crypto"], pricing: "FREE", age: "AGE_18_PLUS", publishedDaysAgo: 2 },
  { slug: "sample-pending-review", name: "Pending Review App", tagline: "Unpublished fixture",
    description: NOTE + "Under review — must stay hidden.", features: [], primary: "productivity-notes",
    tags: ["notes"], pricing: "FREE", status: "UNDER_REVIEW", publishedDaysAgo: 1 },
  { slug: "sample-security-restricted", name: "Security Restricted App", tagline: "Security-restricted fixture",
    description: NOTE + "Restricted by monitoring — must stay hidden.", features: [], primary: "productivity-notes",
    tags: ["notes"], pricing: "FREE", securityStatus: "RESTRICTED", publishedDaysAgo: 30 },
  { slug: "sample-geo-limited", name: "Geo Limited Planner", tagline: "Trip planning (not available in DE)",
    description: NOTE + "Has a country restriction for DE.", features: ["Itineraries"], primary: "travel-trip-planning",
    tags: ["travel"], pricing: "FREE", geoBlocked: ["DE"], publishedDaysAgo: 7 },
];

/** Editorial relations between fixtures. */
export const FIXTURE_RELATIONS: Array<[from: string, to: string, type: "ALTERNATIVE" | "COMPETITOR" | "SIMILAR"]> = [
  ["sample-lumen-notes", "sample-quillpad", "ALTERNATIVE"],
  ["sample-codewisp", "sample-openpilot-code", "COMPETITOR"],
  ["sample-orbit-chat", "sample-codewisp", "SIMILAR"],
];

export const FIXTURE_COLLECTIONS = [
  { slug: "sample-student-starter-kit", title: "Student starter kit (sample)",
    description: "Fictional sample collection: tools for studying and staying organised.",
    items: ["sample-lumen-notes", "sample-lingo-leaf", "sample-paperfold-pdf", "sample-starfield-quiz"] },
];

export const FIXTURE_FEATURED = ["sample-orbit-chat", "sample-lumen-notes", "sample-lingo-leaf"];

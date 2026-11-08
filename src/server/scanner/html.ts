import { createHash } from "node:crypto";
import { parse } from "node-html-parser";

export interface PageInfo {
  title: string | null;
  text: string;
  contentHash: string | null;
  metaVerification: string[];
  passwordForms: Array<{ action: string | null }>;
  asksForSeedPhrase: boolean;
  scriptCount: number;
}

/** Extracts what the heuristics need. HTML is parsed as data and never executed. */
export function analyzeHtml(html: string): PageInfo {
  if (!html) return { title: null, text: "", contentHash: null, metaVerification: [], passwordForms: [], asksForSeedPhrase: false, scriptCount: 0 };
  const root = parse(html, { blockTextElements: { script: false, style: false, noscript: false } });
  const title = root.querySelector("title")?.text.trim().slice(0, 200) || null;
  const text = root.text.replace(/\s+/g, " ").trim().slice(0, 20000);
  const metaVerification = root.querySelectorAll('meta[name="webcenta-verification"]').map((m) => m.getAttribute("content") ?? "").filter(Boolean);
  const passwordForms = root.querySelectorAll("form").filter((f) => f.querySelector('input[type="password"]')).map((f) => ({ action: f.getAttribute("action") ?? null }));
  const lower = text.toLowerCase();
  const asksForSeedPhrase = /(seed phrase|recovery phrase|secret recovery|mnemonic phrase|12[- ]word|24[- ]word|private key)/.test(lower)
    && root.querySelectorAll("input, textarea").length >= 1 && /(enter|import|restore|validate|sync|connect)/.test(lower);
  return {
    title, text, metaVerification, passwordForms, asksForSeedPhrase,
    contentHash: text ? createHash("sha256").update(text.toLowerCase()).digest("hex") : null,
    scriptCount: (html.match(/<script\b/gi) ?? []).length,
  };
}

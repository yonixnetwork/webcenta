import { parse, type HTMLElement } from "node-html-parser";

/**
 * What a website says about itself, read from its own HTML and web app manifest:
 * name, description, icons, promotional/screenshot images and policy links.
 * HTML is parsed as data and never executed.
 */
export interface SiteMetadata {
  name: string | null;
  description: string | null;
  siteName: string | null;
  lang: string | null;
  iconUrls: string[];
  imageUrls: string[];
  manifestUrl: string | null;
  privacyUrl: string | null;
  termsUrl: string | null;
  hasPricingPage: boolean;
  mentionsFree: boolean;
  installable: boolean;
  mobileFriendly: boolean;
}

const abs = (href: string | undefined | null, base: string): string | null => {
  if (!href) return null;
  try {
    const u = new URL(href.trim(), base);
    return u.protocol === "https:" ? u.toString() : null;
  } catch { return null; }
};

const meta = (root: HTMLElement, ...names: string[]) => {
  for (const n of names) {
    const el = root.querySelector(`meta[property="${n}"]`) ?? root.querySelector(`meta[name="${n}"]`);
    const v = el?.getAttribute("content")?.trim();
    if (v) return v;
  }
  return null;
};

/** "Notion – The all-in-one workspace | Notion" → "Notion". */
export function cleanName(title: string | null, siteName: string | null): string | null {
  if (siteName && siteName.length <= 60) return siteName.trim();
  if (!title) return null;
  const parts = title.split(/\s+[|–—·:-]\s+/).map((p) => p.trim()).filter(Boolean);
  const best = parts.sort((a, b) => a.length - b.length)[0] ?? title;
  return best.slice(0, 80);
}

export function parseSiteHtml(html: string, baseUrl: string): SiteMetadata {
  const root = parse(html, { blockTextElements: { script: false, style: false, noscript: false } });
  const title = root.querySelector("title")?.text.replace(/\s+/g, " ").trim() || null;
  const siteName = meta(root, "og:site_name", "application-name", "apple-mobile-web-app-title");
  const description = meta(root, "description", "og:description", "twitter:description");
  const links = root.querySelectorAll("link");
  const rel = (l: HTMLElement) => (l.getAttribute("rel") ?? "").toLowerCase();
  const sized = (l: HTMLElement) => Number((l.getAttribute("sizes") ?? "0x0").split(/x/i)[0]) || 0;
  const iconUrls = links
    .filter((l) => /apple-touch-icon|(^|\s)icon(\s|$)/.test(rel(l)) && !/\.svg(\?|$)/i.test(l.getAttribute("href") ?? ""))
    .sort((a, b) => (rel(b).includes("apple") ? 1000 : sized(b)) - (rel(a).includes("apple") ? 1000 : sized(a)))
    .map((l) => abs(l.getAttribute("href"), baseUrl))
    .filter((u): u is string => Boolean(u));
  const imageUrls = [meta(root, "og:image:secure_url", "og:image"), meta(root, "twitter:image", "twitter:image:src")]
    .map((u) => abs(u, baseUrl)).filter((u): u is string => Boolean(u));
  const manifestUrl = abs(links.find((l) => rel(l) === "manifest")?.getAttribute("href"), baseUrl);
  const anchors = root.querySelectorAll("a[href]");
  const findLink = (re: RegExp) => {
    const a = anchors.find((x) => re.test(x.text.trim()) || re.test(x.getAttribute("href") ?? ""));
    return a ? abs(a.getAttribute("href"), baseUrl) : null;
  };
  const text = root.text.replace(/\s+/g, " ").toLowerCase();
  return {
    name: cleanName(title, siteName), description: description?.slice(0, 600) ?? null, siteName,
    lang: root.querySelector("html")?.getAttribute("lang")?.slice(0, 8).toLowerCase() ?? null,
    iconUrls: [...new Set(iconUrls)], imageUrls: [...new Set(imageUrls)], manifestUrl,
    privacyUrl: findLink(/privacy/i), termsUrl: findLink(/\bterms\b|terms[-_ ]of|conditions|\btos\b/i),
    hasPricingPage: anchors.some((x) => /pricing|plans/i.test(x.getAttribute("href") ?? "") || /^(pricing|plans)$/i.test(x.text.trim())),
    mentionsFree: /\bfree\b/.test(text),
    installable: Boolean(manifestUrl),
    mobileFriendly: /width=device-width/.test(meta(root, "viewport") ?? ""),
  };
}

export interface ManifestInfo { name: string | null; description: string | null; iconUrls: string[]; screenshotUrls: string[]; standalone: boolean }

/** Reads a web app manifest (PWA): name, icons (largest PNG first) and screenshots. */
export function parseManifest(json: string, manifestUrl: string): ManifestInfo {
  let m: Record<string, unknown>;
  try { m = JSON.parse(json) as Record<string, unknown>; } catch { return { name: null, description: null, iconUrls: [], screenshotUrls: [], standalone: false }; }
  type Img = { src?: string; sizes?: string; type?: string; form_factor?: string };
  const imgs = (v: unknown): Img[] => (Array.isArray(v) ? (v as Img[]).filter((x) => x && typeof x.src === "string") : []);
  const size = (x: Img) => Math.max(...String(x.sizes ?? "0x0").split(/\s+/).map((s) => Number(s.split(/x/i)[0]) || 0));
  const icons = imgs(m.icons).filter((x) => !/svg/.test(x.type ?? "") && !/\.svg(\?|$)/i.test(x.src!)).sort((a, b) => size(b) - size(a));
  // Wide screenshots first (they suit the store's landscape cards).
  const shots = imgs(m.screenshots).sort((a, b) => (b.form_factor === "wide" ? 1 : 0) - (a.form_factor === "wide" ? 1 : 0));
  return {
    name: typeof m.name === "string" ? m.name.slice(0, 80) : typeof m.short_name === "string" ? m.short_name.slice(0, 80) : null,
    description: typeof m.description === "string" ? m.description.slice(0, 600) : null,
    iconUrls: icons.map((x) => abs(x.src, manifestUrl)).filter((u): u is string => Boolean(u)),
    screenshotUrls: shots.map((x) => abs(x.src, manifestUrl)).filter((u): u is string => Boolean(u)),
    standalone: ["standalone", "fullscreen", "minimal-ui"].includes(String(m.display ?? "")),
  };
}

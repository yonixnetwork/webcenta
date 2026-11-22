import type { Catalog } from "./translate";
import { DEFAULT_LOCALE } from "./locales";

/**
 * Namespaces: "common" (site chrome, sent to the browser), "store" (server-rendered pages) and
 * "categories" (names of the top-level categories, keyed by slug).
 */
export const NAMESPACES = ["common", "store", "categories"] as const;
export type Namespace = (typeof NAMESPACES)[number];

const cache = new Map<string, Promise<Catalog>>();

/**
 * One namespace of one language, loaded on first use and kept in memory. Each catalogue is its
 * own lazily imported module, so a request never loads all languages. A missing catalogue is an
 * empty object (English is used for every key).
 */
export function loadCatalog(locale: string, ns: Namespace): Promise<Catalog> {
  const id = `${ns}/${locale}`;
  let p = cache.get(id);
  if (!p) {
    p = import(`./messages/${ns}/${locale}.json`).then((m: { default: Catalog }) => m.default).catch(() => ({}));
    cache.set(id, p);
  }
  return p;
}

export async function loadWithFallback(locale: string, ns: Namespace) {
  const [messages, fallback] = await Promise.all([loadCatalog(locale, ns), loadCatalog(DEFAULT_LOCALE, ns)]);
  return { messages: locale === DEFAULT_LOCALE ? fallback : messages, fallback };
}

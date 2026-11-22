import { getSection } from "@/server/settings/store";
import { parseLocaleList } from "@/i18n/locales";

/** Admin → Settings → Languages & international SEO. Indexed languages are always a subset of enabled ones. */
export async function i18nSettings() {
  const s = await getSection("i18n");
  const enabled = parseLocaleList(s.str("enabledLocales"));
  const indexed = parseLocaleList(s.str("indexedLocales")).filter((c) => enabled.includes(c));
  return { enabled, indexed, indexListings: s.bool("indexListings"), suggest: s.bool("suggestLanguage") };
}

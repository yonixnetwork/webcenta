import { LOCALES, type LocaleInfo } from "@/i18n/locales";
import { loadCatalog, NAMESPACES, type Namespace } from "@/i18n/catalogs";
import { checkCatalog, type CatalogProblem } from "@/i18n/coverage";
import meta from "@/i18n/messages/meta.json";

export interface LanguageCoverage {
  info: LocaleInfo;
  percent: number;
  translated: number;
  total: number;
  byNamespace: Record<Namespace, { translated: number; total: number }>;
  missing: string[];
  problems: Array<CatalogProblem & { ns: Namespace }>;
  /** "original" (English), "ai-draft" (machine/AI drafted, unreviewed) or "human". */
  source: string | null;
  reviewed: boolean;
  updated: string | null;
}

/** Translation coverage of every language, computed from the bundled catalogues (never estimated). */
export async function coverageReport(): Promise<LanguageCoverage[]> {
  const english = Object.fromEntries(await Promise.all(NAMESPACES.map(async (ns) => [ns, await loadCatalog("en", ns)] as const)));
  return Promise.all(LOCALES.map(async (info) => {
    const byNamespace = {} as LanguageCoverage["byNamespace"];
    const missing: string[] = [];
    const problems: LanguageCoverage["problems"] = [];
    let translated = 0, total = 0;
    for (const ns of NAMESPACES) {
      const r = checkCatalog(english[ns]!, info.code === "en" ? english[ns]! : await loadCatalog(info.code, ns));
      byNamespace[ns] = { translated: r.translated, total: r.total };
      translated += r.translated; total += r.total;
      missing.push(...r.missing.map((k) => `${ns}:${k}`));
      problems.push(...r.problems.map((p) => ({ ...p, ns })));
    }
    const m = (meta as Record<string, { source: string; reviewed: boolean; updated: string }>)[info.code];
    return { info, percent: total ? Math.floor((translated / total) * 100) : 0, translated, total, byNamespace, missing, problems, source: m?.source ?? null, reviewed: Boolean(m?.reviewed), updated: m?.updated ?? null };
  }));
}

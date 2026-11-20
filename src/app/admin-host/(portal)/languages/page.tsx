import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { Card, Field, inputClass } from "@/components/ui/form";
import { DataTable, td } from "@/components/portal/table";
import { requireAdmin } from "@/server/admin/auth";
import { db } from "@/server/db";
import { coverageReport } from "@/server/i18n/coverage-report";
import { i18nSettings } from "@/server/i18n/settings";
import { sitemapEntries, SITEMAP_LIMIT } from "@/server/seo/sitemap-entries";
import { getSection } from "@/server/settings/store";
import { saveCategoryTranslationAction, saveLocaleSeoAction } from "@/server/actions/international";
import { LOCALES, localeInfo, normalizeLocale } from "@/i18n/locales";
import { hreflangProblems, languageAlternates } from "@/i18n/seo-rules";
import { loadCatalog } from "@/i18n/catalogs";

export const metadata = { title: "SEO & languages" };

const SOURCE_LABEL: Record<string, string> = { original: "Original (English)", "ai-draft": "AI-drafted, not reviewed", human: "Human translation" };

/**
 * Admin → SEO & languages: translation coverage measured from the catalogues, hreflang and
 * sitemap checks, homepage metadata per language and category names per language.
 */
export default async function LanguagesAdmin({ searchParams }: { searchParams: Promise<{ locale?: string }> }) {
  await requireAdmin("settings.manage");
  const sp = await searchParams;
  const origin = (process.env.PUBLIC_ORIGIN || "http://localhost:3000").replace(/\/$/, "");
  const [report, s, seo, entries, localeSeo] = await Promise.all([
    coverageReport(), i18nSettings(), getSection("seo"),
    sitemapEntries(origin).catch(() => []),
    db.localeSeo.findMany(),
  ]);
  const selected = normalizeLocale(sp.locale) ?? s.enabled.find((c) => c !== "en") ?? "es";
  const sel = localeInfo(selected);

  // hreflang: build the alternates of a few representative pages exactly as the pages do, and check them.
  const pages: Record<string, Record<string, string>> = {};
  for (const path of ["/", "/apps", "/categories"]) for (const code of s.indexed) {
    const a = languageAlternates(path, code, s.indexed, origin);
    pages[a.canonical] = a.languages;
  }
  const hreflang = hreflangProblems(pages);
  const incompleteIndexed = report.filter((r) => s.indexed.includes(r.info.code) && r.percent < 100);
  const perLocale = new Map<string, number>();
  for (const e of entries) {
    const seg = new URL(e.url).pathname.split("/")[1] ?? "";
    const code = LOCALES.find((l) => l.prefix === seg && l.code !== "en")?.code ?? "en";
    perLocale.set(code, (perLocale.get(code) ?? 0) + 1);
  }

  const [cats, overrides, bundled] = await Promise.all([
    db.category.findMany({ where: { parentId: null, isEnabled: true }, orderBy: { sortOrder: "asc" }, select: { id: true, slug: true, name: true } }),
    db.categoryTranslation.findMany({ where: { locale: selected } }),
    loadCatalog(selected, "categories"),
  ]);
  const override = new Map(overrides.map((o) => [o.categoryId, o]));
  const seoRow = localeSeo.find((r) => r.locale === selected);

  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">SEO &amp; languages</h1>

      <Card>
        <h2 className="mb-2 font-semibold">Status</h2>
        <ul className="space-y-1 text-sm">
          <li>Search engine indexing: <strong>{seo.bool("allowIndexing") ? "allowed" : "blocked (robots.txt disallows everything, pages carry noindex)"}</strong> — <Link href="/settings/seo" className="text-brand underline">Branding &amp; SEO</Link></li>
          <li>Languages visitors can choose: <strong>{s.enabled.length}</strong> ({s.enabled.join(", ")})</li>
          <li>Languages offered to search engines: <strong>{s.indexed.length}</strong> ({s.indexed.join(", ")}) · app pages in other languages {s.indexListings ? "indexed" : "not indexed"} — <Link href="/settings/i18n" className="text-brand underline">Languages &amp; international SEO settings</Link></li>
          <li>Sitemap: <strong>{entries.length}</strong> URL{entries.length === 1 ? "" : "s"} (limit {SITEMAP_LIMIT.toLocaleString("en")}) · <a href={`${origin}/sitemap.xml`} className="text-brand underline">/sitemap.xml</a> · by language: {[...perLocale].map(([c, n]) => `${c} ${n}`).join(", ") || "none"}</li>
          <li data-testid="hreflang-status">hreflang check: {hreflang.length ? <strong className="text-danger">{hreflang.length} problem{hreflang.length === 1 ? "" : "s"}</strong> : <strong className="text-success">reciprocal, valid language codes, x-default present</strong>}</li>
        </ul>
        {hreflang.length > 0 && <ul className="mt-2 list-disc ps-5 text-xs text-danger">{hreflang.slice(0, 20).map((p) => <li key={p}>{p}</li>)}</ul>}
        {incompleteIndexed.length > 0 && <p className="mt-2 text-sm text-warning">Offered to search engines but not fully translated: {incompleteIndexed.map((r) => `${r.info.english} (${r.percent}%)`).join(", ")}. Missing text is shown in English on those pages.</p>}
        <p className="mt-3 text-xs text-subtle">
          Search Console and Bing Webmaster Tools: submit {origin}/sitemap.xml once. Webcenta cannot see whether pages are indexed; check the
          Pages and International targeting reports there. AI-drafted translations are marked below and have not been reviewed by native speakers.
        </p>
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold">Translation coverage</h2>
        <p className="mb-3 text-xs text-subtle">Measured from the bundled message catalogues (site navigation, prompts, store pages and top-level category names). Admin, developer-portal, email and policy texts are English only. App descriptions and reviews are shown in their original language.</p>
        <DataTable head={["Language", "Code", "Priority", "Offered", "Coverage", "Missing", "Errors", "Source", "Updated"]}>
          {report.map((r) => (
            <tr key={r.info.code} className="border-t border-border" data-testid={`coverage-${r.info.code}`}>
              <td className={td}><span lang={r.info.code} dir={r.info.dir}>{r.info.native}</span><br /><span className="text-xs text-subtle">{r.info.english}{r.info.dir === "rtl" ? " · right-to-left" : ""}</span></td>
              <td className={`${td} font-mono text-xs`}>{r.info.code}</td>
              <td className={td}>P{r.info.tier}</td>
              <td className={td}>{s.indexed.includes(r.info.code) ? "Visitors + search" : s.enabled.includes(r.info.code) ? "Visitors" : "Off"}</td>
              <td className={td}><strong>{r.percent}%</strong><br /><span className="text-xs text-subtle">{r.translated}/{r.total}</span></td>
              <td className={td}>
                {r.missing.length === 0 ? "0" : r.missing.length === r.total ? `all ${r.total}` : (
                  <details><summary className="cursor-pointer">{r.missing.length}</summary><ul className="mt-1 max-h-40 overflow-auto font-mono text-[11px]">{r.missing.map((k) => <li key={k}>{k}</li>)}</ul></details>
                )}
              </td>
              <td className={td}>{r.problems.length ? <details><summary className="cursor-pointer text-danger">{r.problems.length}</summary><ul className="mt-1 text-[11px]">{r.problems.map((p) => <li key={`${p.ns}:${p.key}`}><code>{p.ns}:{p.key}</code> {p.problem}</li>)}</ul></details> : "0"}</td>
              <td className={`${td} text-xs`}>{r.source ? SOURCE_LABEL[r.source] ?? r.source : "—"}{r.source && r.source !== "original" && !r.reviewed ? <><br /><span className="text-warning">Unreviewed</span></> : null}</td>
              <td className={`${td} text-xs`}>{r.updated ?? "—"}</td>
            </tr>
          ))}
        </DataTable>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Edit a language:</h2>
          {s.enabled.filter((c) => c !== "en").map((c) => (
            <Link key={c} href={`/languages?locale=${encodeURIComponent(c)}`} aria-current={c === selected ? "page" : undefined}
              className="rounded-full border border-border px-3 py-1 text-sm aria-[current=page]:border-brand aria-[current=page]:bg-brand-soft aria-[current=page]:text-brand">{localeInfo(c).english}</Link>
          ))}
        </div>
        <h3 className="mb-2 text-sm font-semibold">Homepage search metadata — {sel.english}</h3>
        <ActionForm action={saveLocaleSeoAction} submitLabel="Save metadata">
          <input type="hidden" name="locale" value={selected} />
          <Field label="Title" hint="Up to 70 characters. Empty: the translated default title."><input name="title" maxLength={70} defaultValue={seoRow?.title ?? ""} lang={sel.code} dir={sel.dir} className={inputClass} /></Field>
          <Field label="Description" hint="Up to 170 characters. Empty: the translated default description."><textarea name="description" maxLength={170} rows={2} defaultValue={seoRow?.description ?? ""} lang={sel.code} dir={sel.dir} className={inputClass} /></Field>
          <Field label="Keywords" hint="Up to 10, separated by commas. Search engines largely ignore keywords; never repeat words to rank higher."><input name="keywords" defaultValue={Array.isArray(seoRow?.keywords) ? (seoRow.keywords as string[]).join(", ") : ""} lang={sel.code} dir={sel.dir} className={inputClass} /></Field>
        </ActionForm>

        <h3 className="mb-2 mt-6 text-sm font-semibold">Category names — {sel.english}</h3>
        <p className="mb-2 text-xs text-subtle">Your translation overrides the bundled one. Leave the name empty and save to go back to the bundled (or English) name.</p>
        <ul className="divide-y divide-border">
          {cats.map((c) => {
            const o = override.get(c.id);
            const current = o?.name ?? (typeof bundled[c.slug] === "string" ? (bundled[c.slug] as string) : null);
            return (
              <li key={c.id} className="py-2">
                <details>
                  <summary className="cursor-pointer text-sm"><strong>{c.name}</strong> → <span lang={sel.code} dir={sel.dir}>{current ?? <em className="text-subtle">English name shown</em>}</span>{o ? <span className="ms-2 text-xs text-subtle">({o.reviewed ? "reviewed" : "custom, unreviewed"})</span> : current ? <span className="ms-2 text-xs text-subtle">(bundled AI draft)</span> : null}</summary>
                  <ActionForm action={saveCategoryTranslationAction} submitLabel="Save" className="mt-2">
                    <input type="hidden" name="categoryId" value={c.id} />
                    <input type="hidden" name="locale" value={selected} />
                    <Field label="Name"><input name="name" maxLength={120} defaultValue={o?.name ?? current ?? ""} lang={sel.code} dir={sel.dir} className={inputClass} /></Field>
                    <Field label="Description (optional)"><input name="description" maxLength={500} defaultValue={o?.description ?? ""} lang={sel.code} dir={sel.dir} className={inputClass} /></Field>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="reviewed" defaultChecked={o?.reviewed} className="size-4" />Reviewed by a fluent speaker</label>
                  </ActionForm>
                </details>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}

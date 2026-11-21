# Multilingual SEO audit

## URL structure
- English (x-default): `https://webcenta.com/...` — unchanged, no redirects for existing URLs.
- Other languages: `https://webcenta.com/<prefix>/...` (`/es/`, `/fr/`, `/pt-br/`, `/zh-hans/`, `/ar/` …), served by the same routes (proxy rewrite).
- `/en/...` → 308 to the unprefixed URL (no duplicate English copy). Prefixes of languages that are switched off → 307 to English.
- No redirect based on Accept-Language or country. Only a visitor who chose a language (cookie) is sent to that language's URL, with a temporary redirect; crawlers do not keep that cookie.

## hreflang and canonicals
- Each page declares a self-referencing canonical and `alternates.languages` for every **indexed** language plus `x-default` (`src/server/i18n/seo.ts`). The set is identical on every language version, so links are reciprocal by construction (unit-tested with `hreflangProblems`; checked live in Admin → SEO & languages).
- Page kinds:
  - translated (home, Apps, categories, category pages): all indexed languages;
  - app pages: all indexed languages when "Index app pages in other languages" is on (default), otherwise English only — descriptions are the developer's original text;
  - original-language pages (about, policies, contact, collections): English only; other language versions carry `noindex, follow`.
- Search results, accounts, sign-in, API, admin and developer hosts remain `noindex` / excluded.

## Sitemap
`/sitemap.xml` lists every indexable URL in every language it is indexed in, each with the same `xhtml:link` alternates (`src/server/seo/sitemap-entries.ts`), capped at 50,000 URLs. With 15 indexed languages, ~2,600 listings would reach the cap; split the sitemap (`generateSitemaps`) before that.

## Metadata
Translated page titles, descriptions, category names and `og:locale`. Brand and app names are never translated. Homepage title, description and keywords per language are editable (Admin → SEO & languages); keywords are validated (≤ 10, 2–50 characters, no duplicates, links or markup).

## Search Console and Bing
Existing verification (HTML file, meta tag, BingSiteAuth.xml) works on the root domain and covers all language folders. Submit `/sitemap.xml` again so the language URLs are discovered. **No claim is made that any page is indexed**: that can only be confirmed in Search Console and Bing Webmaster Tools.

## Performance
Only the visitor's language catalogue plus English is loaded per request; the browser receives the small `common` catalogue (~8 KB). No hydration mismatch: the server sets `lang`/`dir` from the URL, and the client receives the same messages.

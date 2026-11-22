# Translation audit

Measured with `npm run i18n:check` (also shown in Admin → SEO & languages). Nothing below is estimated.

## Architecture
- Registry: `src/i18n/locales.ts` (50 languages, BCP 47 codes, URL prefixes, native names, text direction, priority tier).
- Catalogues: `src/i18n/messages/<namespace>/<code>.json`. Namespaces: `common` (site chrome; the only one sent to the browser), `store` (server-rendered store pages and metadata), `categories` (top-level category names by slug).
- Loading: each catalogue is its own lazily imported module, cached in memory per process. A request loads only its language plus English (fallback); the browser receives only `common`.
- Lookup: `createT()` (`src/i18n/translate.ts`) — language → English → key. Plurals via `Intl.PluralRules` (zero/one/two/few/many/other), placeholders `{name}`, numbers formatted for the language.
- Values are plain text rendered by React (escaped). The check rejects anything that looks like HTML, `javascript:` or event handlers.
- Provenance: `src/i18n/messages/meta.json` (`source`: original / ai-draft / human, `reviewed`, `updated`). A unit test fails if an AI draft is marked reviewed.

## Coverage (211 keys)
| Languages | Coverage | Source |
|---|---|---|
| English | 100% | original |
| Spanish, French, German, Portuguese (Brazil), Italian, Dutch, Russian, Japanese, Chinese (Simplified), Korean, Arabic, Hindi, Turkish, Polish | 100% of bundled keys | **AI-drafted, not reviewed** |
| The other 35 registered languages | 0% (English shown) | — |

Default settings offer the 15 complete languages to visitors and search engines. Admins can change both lists in Settings → Languages & international SEO.

## What is translated
Header, bottom tab bar, footer, language selector and suggestion, cookie notice, install / update / push prompts, iOS install instructions, account menu, ad labels and "Report this ad", 404 page, homepage (headings, default section titles and subtitles, hero, empty state), categories page, category pages (title, breadcrumb, sub-categories, metadata), app page labels, search page, page titles and descriptions, top-level category names, theme and navigation `aria-label`s.

## What is not translated yet (English)
- Admin portal (staff tool) and developer portal.
- Sign-in, sign-up, password reset and most account forms, validation and server messages.
- Emails and push notification texts.
- Legal policies (Terms, Privacy, Cookies, Content) — legal texts should be translated by qualified translators, not drafted automatically.
- Sub-category names, homepage section titles customised by admins, editorial collection texts.
- User-generated content (descriptions, reviews, replies): kept in the original language by design and marked with `lang`; no machine translation is shown.

## Review process (recommended)
1. A fluent reviewer reads each catalogue in context (`/es/`, `/ar/` …).
2. Corrections go into the JSON file; set `"source": "human"` or keep `ai-draft` with `"reviewed": true` once reviewed.
3. `npm run i18n:check` must pass (CI runs the same check as a unit test).

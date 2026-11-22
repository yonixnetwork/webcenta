# International expansion — checklist

Status legend: ✅ done and tested · 🟡 done with documented limits · ⏳ needs the owner (account, credentials or a decision) · ❌ not done.

## 1. Header, bottom navigation and PWA prompts
- ✅ Exactly one header, one bottom tab bar and one footer: they are rendered only by `src/app/(public)/layout.tsx` (verified by search and by `tests/e2e/international.spec.ts`, which counts them after every tab, after Back, and with `display-mode: standalone` emulated).
- ✅ Tab bar fixed to the viewport bottom, above the home indicator (`env(safe-area-inset-bottom)`), stable while scrolling (tested at 390 × 844 after scrolling 2,000 px).
- ✅ Install, update and push prompts and the cookie notice use one rule (`above-mobile-nav` in `globals.css`): on phones they sit above the tab bar plus the safe area; on larger screens at the bottom edge. Test: the install prompt's bottom edge is above the tab bar's top edge.
- ✅ Install prompt dismissible, choice remembered (`wc-install-dismissed`); not shown in installed mode.
- ✅ Home / Games / Apps / Search kept.
- 🟡 The uploaded screenshots mentioned in the request were not attached to the conversation, and webcenta.com cannot be reached from this build environment (the network proxy refuses it), so the investigation used the code and production builds run locally. See `responsive-audit.md` for the root causes found.

## 2. Card navigation and detail page
- ✅ Store rows and featured cards are one link each; no nested links or buttons; keyboard reachable (tested: Enter on a focused row opens the app page).
- ✅ "View" pills and the "View" label on featured cards removed; section headings use a plain "See all" text link instead of a chevron.
- ✅ Exactly one "Visit Official Website" button on an app page (tested).
- ✅ The "Ready to try …?" box with its sponsored unit and second visit button removed.
- ✅ At most two ads on an app page (placement manager maximum lowered to 2; setting capped at 2): one between the app's details and the reviews, and the desktop sidebar unit. Tested: ≤ 2 loaded, the inline one > 300 px below the visit button.

## 3. Advertising content and country restrictions
- ✅ Admin → Settings → Ad content policy: ten brand-safety categories (all blocked by default), behaviour when the country is unknown, blocked-advertiser register, dates when provider dashboards were last checked.
- ✅ Enforced by Webcenta: no ads on app pages in blocked categories or rated 18+; no ads / no provider for countries switched off in Country policies; optional "no ads when the country is unknown"; the ad frame endpoint applies the same rules.
- ✅ "Report this ad" link on every ad label → `/report-ad` → Admin → Ad reports & policy (resolve / dismiss, audit-logged).
- 🟡 The creative inside an ad frame is chosen by the provider and cannot be inspected or filtered by Webcenta. Category and advertiser blocking must be applied in the AdSense and Adsterra dashboards (checklist on the Ad reports page). See `advertising-audit.md`.
- ✅ AdSense first, Adsterra fallback, never both in one slot; same rules for both.

## 4. Country detection
- ✅ Country from the configured CDN header only (`cf-ipcountry` by default); no GPS, no IP stored for this, unknown is never guessed.
- ✅ No country question at sign-up; optional region in account settings.
- ✅ Restrictions of detected and chosen country add up; choosing a country never removes a restriction (unit-tested, including age of majority).
- ✅ Admin → Country policies table (restricted / permitted categories, adult age, ads off, providers off, last reviewed, notes); removing a policy needs a fresh authenticator code.
- ✅ Privacy Policy explains country detection, language storage and ad reports (published as a new version on existing installs if the policy text was never edited).
- ⏳ Hostinger does not add a country header by itself. Until a CDN that sets one (for example Cloudflare's `CF-IPCountry`) is in front of webcenta.com, every visitor's country is **unknown**. An offline GeoIP database was considered; installing it was blocked in this session and needs the owner's approval (see `geo-compliance.md`).

## 5. Languages
- ✅ 50 languages registered (P1 15, P2 25, P3 10 with Afrikaans as no. 50), valid BCP 47 codes, native names, four right-to-left languages.
- ✅ URLs: English unprefixed, others `/es/…`, `/pt-br/…`, `/zh-hans/…`; same routes; `/en/…` → 308; switched-off languages → 307 to English.
- ✅ Selector in the header, footer, account menu and profile settings; choice saved in a cookie and in the account; browser language only suggested.
- ✅ Locale-aware dates, numbers, plurals, collation and country names (`src/i18n/format.ts`, `Intl`).
- ✅ Real RTL: `dir="rtl"` on `<html>`, logical spacing classes in the public UI (tested: Arabic at 360 and 1440 px, no horizontal scroll, mirrored header).
- 🟡 Coverage: 15 languages have every bundled key (211 keys: navigation, prompts, consent, store pages, metadata, top-level category names); 35 have none and show English. The 14 non-English translations were drafted by AI and **have not been reviewed by native speakers** (marked "Unreviewed" in the dashboard). Admin, developer portal, emails, legal texts and many account forms remain English. See `translation-audit.md`.
- ✅ Developer-written descriptions and reviews stay in their original language and are marked with `lang`.
- ✅ Admin → SEO & languages: languages, coverage %, missing keys, errors, source / review state, last update; `npm run i18n:check` and a unit test fail on markup, placeholder or plural errors.

## 6–7. Multilingual SEO and admin
- ✅ hreflang (reciprocal, x-default, only indexed languages) and self-referencing canonicals; pages whose main text is not translated are indexed only in English.
- ✅ Multilingual sitemap with the same alternates.
- ✅ Translated titles and descriptions; per-language homepage title, description and keywords (validated); category names per language (admin overrides).
- ✅ hreflang validation, sitemap status and robots status in Admin → SEO & languages.
- ⏳ Search Console / Bing: submit `/sitemap.xml`; indexing can only be confirmed there.

## 8–11. Performance, security, tests, deployment
- See `test-results.md` and `seo-audit.md`. Deployment status is in the final report.

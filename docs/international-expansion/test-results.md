# Test results — international expansion

Environment: this build container (Linux, Chromium via Playwright, MariaDB 10.11 and MySQL 8 locally). Production (webcenta.com) cannot be reached from this container: the network proxy refuses the host, so nothing below was run against the live site.

## Automated
| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm run build` (webpack, standalone) | pass |
| `npm run i18n:check` | pass — 15 of 50 languages have all 211 keys, 35 have none (English shown), 0 errors |
| `npx vitest run` (unit + DB) | 363 passed (includes `tests/unit/i18n.test.ts`, 16 tests: registry, routing, open-redirect guard, plural/fallback, catalogue validity, provenance, hreflang reciprocity, keyword validation, country-rule combination, age of majority) |
| Playwright, all projects (journeys, desktop, tablet, mobile) | 164 passed, 3 skipped (opt-in suites), 1 test fixed and re-run (see below) |
| `tests/e2e/international.spec.ts` | 11 passed |
| Responsive audit (`RESPONSIVE_AUDIT=1`), 23 pages × 10 viewports incl. es, fr, de, ja, zh-Hans, ar | 230 checks, 0 problems (no overflow, no element wider than the screen, tab bar inside the screen, no console errors) |
| Migration `20261116120000_international` vs schema (`prisma migrate diff`) | empty diff |

The one failure in the full run was a test selector: `getByRole("combobox").first()` found the new language `<select>` (implicit role combobox) before the search box. The selector now targets the visible search input; marketplace and journeys re-run on all projects: 66 passed.

## What the international E2E tests prove
- `/es`, `/fr`, `/de`, `/ja`, `/zh-hans`, `/ar` serve translated chrome with the right `lang`; Arabic has `dir="rtl"` and a mirrored header, no horizontal scroll at 360 and 1440 px.
- `/en/…` → 308; switched-off language → 307; `/es/api/…` → 307; Accept-Language never redirects.
- The selector switches language, keeps the page, is remembered (English URL → Spanish), and can switch back.
- Browser-language suggestion is shown in that language, never redirects, and stays dismissed.
- Exactly one header and one tab bar after every tab, Back and scrolling, in the browser and with installed-app mode emulated; tab bar 8–40 px from the bottom edge.
- Install prompt above the tab bar (no overlap), dismissible, remembered.
- Store rows are single links with no nested controls, keyboard-activatable; one "Visit Official Website" button; ≤ 2 ads on app pages and none right below the button (repair spec).
- hreflang includes x-default and the indexed languages with a self canonical; untranslated pages are `noindex` outside English; sitemap lists `/es/…` URLs with alternates and no private paths.
- Country policy: invalid category rejected; DE policy hides the category's apps and all ads for `cf-ipcountry: DE`, not for US; the ad frame endpoint obeys the same rule; "no ads when unknown" works.
- Ad report: submitted from `/report-ad` without IP, shown and closed in the admin.

## Security review of the new features
| Risk | Mitigation |
|---|---|
| XSS through translations or admin-entered names | All text rendered by React (escaped); catalogue check rejects markup; admin inputs length-limited |
| Open redirect via language redirects (`/en//evil.example`) | Found during review; redirect targets are forced to same-site paths; unit-tested |
| Spoofed `x-wc-locale` header | Always overwritten by the proxy; value validated against the registry |
| Country spoofing / bypass | Restrictions of detected and chosen country add up; a chosen country cannot relax them; trusting the header requires a CDN that overwrites it (documented) |
| Ad-policy bypass by opening a frame URL | Frame endpoint applies country rules; `cache-control: private` |
| Removing a country policy | Requires fresh authenticator code; all changes audit-logged |
| Abuse of ad reports | Honeypot, 10 per hour per visitor hash, length limits; no IP stored |
| Private routes indexed in other languages | Sitemap built from the same public list; accounts, search, API, admin and developer hosts excluded; untranslated pages noindex |
| SSRF | No new outbound requests were added |
| Secrets | None added; no new environment variables |

IP processing: the country comes from a request header; the IP itself is not stored for this purpose. Existing security logs (sign-ins) keep IP addresses for up to 180 days (purged daily), as before. Ad reports keep a country code for 12 months.

## Not verified here
- Real devices (iPhone Safari / installed PWA, Android Chrome): tested with Chromium emulation only.
- Live production behaviour and Search Console / Bing indexing.
- Translation quality: AI drafts, not reviewed by native speakers.

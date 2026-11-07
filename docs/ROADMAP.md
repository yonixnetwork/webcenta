# WebCenter — Implementation Status

Legend: ✅ implemented and covered by automated tests · 🟡 implemented, needs external configuration
or real-world verification · ⬜ not implemented

The phases are internal milestones. All of them have been built and integrated. External services
need configuration before production use. See [FINAL_REPORT.md](FINAL_REPORT.md) for the evidence and
the list of unverified items.

## Marketplace
| Feature | Status |
| --- | --- |
| Homepage rails (featured, editor's picks, trending, popular, highly rated, new, recently updated, by category, collections, personalised); rails appear only with real data | ✅ |
| 48 categories, 264 subcategories, risk tiers, age ratings, restricted categories; admin add/edit/reorder/merge/disable | ✅ |
| Search (FTS + trigram, typo/prefix), autocomplete, suggested searches, filters (pricing, open source, browser, mobile, PWA, verified developer, recently updated, highly rated, platform, country), sorting, pagination | ✅ |
| App pages: trust panel (honest wording), screenshots, features, info, tags, JSON-LD, share, save, collections, report, reviews | ✅ |
| Similar apps, competitors, free / open-source / better-rated alternatives, alternatives page | ✅ |
| Leaving-WebCenter interstitial and tracked, non-open redirect | ✅ |
| Country (listing and category) and age restrictions enforced everywhere | ✅ (country detection needs a geo header, e.g. Cloudflare 🟡) |

## Accounts & community
| Feature | Status |
| --- | --- |
| Email + password, verification, sign-in/out, password reset, session management, sign-in history | ✅ |
| Google and Apple sign-in | 🟡 implemented; requires OAuth credentials; not tested against the real providers |
| Profile, privacy controls, personalisation/history toggles, clear history, interests, 18+ self-declaration, data export, account deletion (30-day purge) | ✅ |
| Favourites, collections (private/unlisted/public) | ✅ |
| Ratings, reviews (edit/delete), helpful votes, review reports, anti-spam holds, developer replies, notifications (in-app + email) | ✅ (email delivery via SMTP 🟡) |
| Appeals (listings and reviews), contact/support desk | ✅ |

## Developer portal (`/developer`; `developers.` host redirects there)
| Feature | Status |
| --- | --- |
| Organisations, members and roles, profile | ✅ |
| Domain verification: DNS TXT, HTML meta, well-known file | ✅ (meta and file tested E2E; DNS TXT unit-level only 🟡) |
| Submission editor, image uploads (re-encoded), drafts, revisions, submit, status tracking, edits to live listings | ✅ |
| Compliance documents (private PDFs), claims of editorial listings | ✅ |
| Review replies, analytics (views, uniques, clicks, CTR, countries, devices, referrers, search impressions) | ✅ |
| Plans view and sponsored-placement requests (no billing) | ✅ |

## Admin portal (admin host)
| Feature | Status |
| --- | --- |
| Invitation-only accounts, provisioning CLI, mandatory TOTP with replay protection, lockout, idle/absolute timeouts, host-only cookie, optional IP allow-list | ✅ |
| RBAC (5 roles), audit log, admin sign-in history | ✅ |
| Overview, submissions, applications (edit, suspend, remove, reinstate, editorial create, editor's picks, placements, geo restrictions, manual scans), categories, homepage curation, users, developers (verification, compliance docs), reports, reviews, appeals, claims, security, analytics, support, monetisation, settings and legal, administrators, jobs and email | ✅ |

## Security monitoring
| Feature | Status |
| --- | --- |
| SSRF-safe fetcher (DNS pinning, private ranges, redirect re-validation, timeouts, size caps) | ✅ |
| Checks: DNS, HTTP, redirects, TLS, phishing heuristics, impersonation, downloads, policy pages, domain ownership, identity/DNS change detection, WebCenter blocklist | ✅ |
| Google Web Risk, URLhaus, VirusTotal adapters | 🟡 implemented; need API keys; not tested against the live APIs |
| Risk-based approval (auto-approval only with an external provider), scheduled re-scans per tier, deduplicated alerts, auto-restriction, investigation, suspension and reinstatement | ✅ |
| Scanner isolation on a separate host | ⬜ planned for the VPS stage (runs in-process with guards on Hostinger) |

## Analytics, ranking, personalisation
| Feature | Status |
| --- | --- |
| Privacy-first events (daily random salts, bot filtering, 30-min dedupe), daily roll-ups, small-count suppression | ✅ |
| Developer and platform analytics (growth, categories, apps, searches, zero-result searches, countries, devices) | ✅ |
| Organic trending/popularity scores (Bayesian ratings, time decay, admin weights; sponsorship never an input) | ✅ |
| Recommendations: recommended for you, because you viewed, similar to favourites, popular in your interests, recently explored, discover something new (diversity guarantee) | ✅ |

## Platform
| Feature | Status |
| --- | --- |
| PWA: manifest, icons, service worker, offline fallback, update prompt, install prompt, iOS instructions | ✅ (Chromium-tested; real devices 🟡) |
| SEO: metadata, canonicals, sitemap, robots, JSON-LD, noindex where needed | ✅ |
| Accessibility: axe WCAG 2.1 AA, no serious or critical violations on tested pages, both themes | ✅ |
| Monetisation foundations: plans, sponsorship workflow, labelled sponsored placements | ✅ (billing intentionally inactive) |
| Error monitoring (Sentry) | ⬜ not wired; hosting logs only |

## Decisions still with the owner
D0 approve production deployment · D2 object storage provider · D3 SMTP provider · D4 Apple Developer
account · D5 threat-intel providers and budget · D6 legal review for restricted categories and policy
texts · D7 repository rename · D8 Cloudflare in front of Hostinger.

# Country detection and compliance

## How the country is determined
1. The request header named in Settings → Security → Country header (default `cf-ipcountry`), set by a CDN or proxy from the visitor's IP address.
2. Only a valid two-letter code is accepted; `XX` (unknown) and `T1` (Tor) are treated as unknown.
3. Nothing else: no GPS or browser location, no third-party lookup, no guessing. If the header is missing the country is **unknown**.

Webcenta does not store the IP address for this purpose. The country code is used for the request only, except in ad reports (kept 12 months).

### Current production limitation
Hostinger's web hosting does not add a country header by itself. Until webcenta.com is behind a CDN that sets one (Cloudflare `CF-IPCountry`, or any CDN header configured in Settings → Security), every visitor is "unknown". Effects with the default settings: listings and categories restricted to certain countries are hidden ("deny"), country policies cannot apply, and ads use the brand-safe default.
Options for the owner:
- Put a CDN in front of the site that sets a trusted country header (DNS change: owner's decision; not done here).
- Approve adding an offline country database (for example DB-IP Lite country, CC BY 4.0, ~16 MB). Installing it was attempted in this session and blocked by the session's permission policy, so it was not added.

A header is only trustworthy if the CDN overwrites it. Without a CDN, a visitor could send the header themselves; this can only change which country's restrictions apply (and VPNs already allow the same), which is why restrictions of the chosen and detected country add up and never relax a global rule.

## Uses
| Use | Country used |
|---|---|
| Hidden categories / listings, minimum adult age (Country policies) | detected AND chosen (stricter wins) |
| Listing geo-restrictions | detected, else chosen |
| Ads off / provider off | detected AND chosen |
| Regional display (currency label, country names) | chosen, else detected |
| Language | never — language is independent of country |

## Country policy table (Admin → Country policies)
Columns: country, restricted categories (slugs, validated), permitted categories (record only — never lifts a global block), minimum adult age (18–25), ads off, providers off, last reviewed, notes. Changes are audit-logged; deleting a policy requires a fresh authenticator code. No policies are pre-filled: which categories are lawful in which country is a legal question for the owner.

## Sign-up and profile
Registration does not ask for a country. Account → Profile → Region is optional and explains that restrictions where the visitor is still apply.

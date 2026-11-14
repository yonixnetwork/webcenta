# Search engines: Google and Bing

Webcenta's public pages are built to be indexed. The admin portal and developer portal are not: they send `X-Robots-Tag: noindex, nofollow`, their robots.txt is `Disallow: /`, and they require sign-in. Indexing is never instant and rankings are never guaranteed.

## Addresses

| What | URL |
|---|---|
| Sitemap (single file, up to 40 000 listings) | https://webcenta.com/sitemap.xml |
| robots.txt | https://webcenta.com/robots.txt |
| Google Search Console | https://search.google.com/search-console |
| Bing Webmaster Tools | https://www.bing.com/webmasters/ |

**Sitemap content.**
* Included: home, `/apps`, `/categories`, every public category (except 18+ gates), every published app page with its last content change, editorial collections, About and the policies.
* Excluded: accounts, sign-in, search results, drafts, rejected, suspended or removed listings, sample listings, admin, developer pages and APIs.

It is generated on request, so it changes as soon as a listing is published, updated or removed. If the catalogue approaches 40 000 apps, it should be split into a sitemap index (noted in `src/app/sitemap.ts`).

**robots.txt.**
* Allows the whole public site.
* Disallows only private or low-value paths (`/account`, `/signin`, `/search`, `/go/`, `/api/`…).
* Links the sitemap.

robots.txt is not access control: private pages are protected by sign-in and carry `noindex`.

**App pages.** Each published app page has:
* its own title and description (from the app's summary, category and publisher);
* a canonical URL (`/app/<slug>`);
* Open Graph and Twitter data with the app's real screenshot or logo;
* `WebApplication` structured data (a SoftwareApplication type).

A price appears only for genuinely free apps, and a rating only when real reviews exist. Nothing is invented.

## Google Search Console

1. Go to https://search.google.com/search-console → *Add property*.
2. Choose a method.
   * **Simplest on Hostinger: "URL prefix" property `https://webcenta.com/` with the *HTML tag* method.**
     1. Google shows `<meta name="google-site-verification" content="XXXX">`.
     2. Copy only `XXXX` into **Admin → Settings → Search engines & IndexNow → Google Search Console verification code** and Save.
     3. Back in Google, press *Verify*.

     No file upload and no DNS change.
   * *HTML file*: Google gives a file such as `google1a2b3c4d5e6f7a8b.html`.
     1. Enter that **file name** in Admin → Settings → Search engines & IndexNow → *Google HTML verification file name*.
     2. Webcenta then serves the file at `https://webcenta.com/google1a2b3c4d5e6f7a8b.html` with the exact content Google expects.
     3. Press *Verify*.
   * *DNS TXT (Domain property: covers all subdomains):* add the TXT record Google shows in hPanel → Domains → DNS / Nameservers. This is a DNS change, so only do it if you want a Domain property.
3. Ownership is only confirmed when Google says so in Search Console.
4. After verification, open *Sitemaps* → enter `sitemap.xml` → *Submit*.
5. Monitor:
   * *Pages* (indexed / not indexed, with reasons);
   * *Sitemaps* (discovered URLs);
   * *URL inspection* for a specific app page;
   * *Performance* (clicks and queries; it takes a few days to fill).

## Bing Webmaster Tools

1. Go to https://www.bing.com/webmasters/ and sign in.
2. Easiest: **Import from Google Search Console** (after step 3 above). It copies the verified site and sitemap.
3. Otherwise *Add site* `https://webcenta.com/` and verify with one of these:
   * the *Meta tag*: copy the `content` of `msvalidate.01` into Admin → Settings → Search engines & IndexNow → *Bing verification code*;
   * the *XML file*: copy the code between `<user>` and `</user>` into *Bing XML file code*. Webcenta serves `https://webcenta.com/BingSiteAuth.xml`.
4. *Sitemaps* → *Submit sitemap* → `https://webcenta.com/sitemap.xml`.
5. Monitor *Site Explorer*, *URL Inspection* and *Crawl* (crawl errors, blocked URLs).

## IndexNow (Bing, Yandex, Seznam, Naver and others; not Google)

Webcenta already supports IndexNow:
1. Create a key (any 8–128 letters, digits or dashes; Bing can generate one).
2. Enter it in **Admin → Settings → Search engines & IndexNow → IndexNow key**.
3. Webcenta serves it at `https://webcenta.com/indexnow-key.txt` (*Test connection* checks this).

From then on Webcenta notifies IndexNow when an app page is:
* published;
* updated;
* suspended, removed or reinstated (new in this release).

Only public `/app/…` URLs are ever sent: never private pages or unapproved listings. The notifications run in the scheduler.

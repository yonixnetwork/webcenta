import Script from "next/script";
import { cookies, headers } from "next/headers";
import { CONSENT_COOKIE, parseConsent } from "@/lib/consent";
import { analyticsConfig, isAdPage } from "@/server/settings/site";

/**
 * Analytics and advertising scripts enabled in Admin → Settings. Rendered only
 * in the public layout (never on the admin portal), with the request's CSP
 * nonce; the proxy adds the matching sources to the Content Security Policy.
 * AdSense loads only on general browsing pages (see isAdPage).
 */
export async function ThirdPartyScripts() {
  const h = await headers();
  const nonce = h.get("x-nonce") ?? undefined;
  const pathname = h.get("x-pathname") ?? "/";
  const a = await analyticsConfig().catch(() => null);
  if (!a) return null;
  // Google Analytics and AdSense set cookies: only after the visitor agreed (cookie banner).
  const consent = parseConsent((await cookies()).get(CONSENT_COOKIE)?.value);
  return (
    <>
      {a.plausible && <Script src={a.plausible.scriptUrl} data-domain={a.plausible.domain} strategy="afterInteractive" nonce={nonce} />}
      {a.ga4 && consent?.analytics && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(a.ga4.measurementId)}`} strategy="afterInteractive" nonce={nonce} />
          <Script id="ga4-init" strategy="afterInteractive" nonce={nonce}>
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config",${JSON.stringify(a.ga4.measurementId)});`}
          </Script>
        </>
      )}
      {a.adsense?.autoAds && consent?.ads && isAdPage(pathname) && (
        <Script src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(a.adsense.client)}`} strategy="afterInteractive" crossOrigin="anonymous" nonce={nonce} />
      )}
    </>
  );
}

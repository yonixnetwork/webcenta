/** Cookie consent: strictly necessary cookies are always on; analytics and advertising need a choice. */
export const CONSENT_COOKIE = "wc-consent";
export interface Consent { analytics: boolean; ads: boolean }

/** Value format "v1.a1.d0" (analytics on, advertising off). */
export function encodeConsent(c: Consent): string {
  return `v1.a${c.analytics ? 1 : 0}.d${c.ads ? 1 : 0}`;
}

export function parseConsent(value: string | undefined | null): Consent | null {
  const m = /^v1\.a([01])\.d([01])$/.exec(value ?? "");
  return m ? { analytics: m[1] === "1", ads: m[2] === "1" } : null;
}

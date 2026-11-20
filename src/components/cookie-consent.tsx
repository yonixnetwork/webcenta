"use client";

import { Link, useT } from "@/i18n/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Cookie } from "lucide-react";
import { CONSENT_COOKIE, encodeConsent, type Consent } from "@/lib/consent";
import { buttonClass } from "./ui/button";

function save(c: Consent) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${encodeConsent(c)}; Path=/; Max-Age=${60 * 60 * 24 * 180}; SameSite=Lax${secure}`;
  window.dispatchEvent(new Event("wc-consent"));
}

/**
 * Asks for cookie consent before any analytics or advertising cookie is set. Strictly necessary
 * cookies (sign-in, security, theme, this choice) are always used. "Cookie settings" in the
 * footer reopens it (event "wc-consent-open").
 */
export function CookieConsent({ decided }: { decided: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(!decided);
  const [custom, setCustom] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [ads, setAds] = useState(false);
  const t = useT();
  useEffect(() => {
    const reopen = () => { setOpen(true); setCustom(true); };
    window.addEventListener("wc-consent-open", reopen);
    return () => window.removeEventListener("wc-consent-open", reopen);
  }, []);
  if (!open) return null;
  const choose = (c: Consent) => { save(c); setOpen(false); router.refresh(); };
  return (
    <div role="dialog" aria-labelledby="cc-title" aria-describedby="cc-text" data-testid="cookie-consent"
      className="fixed inset-x-3 above-mobile-nav z-50 mx-auto max-w-lg rounded-3xl border border-border bg-surface p-4 shadow-pop">
      <h2 id="cc-title" className="flex items-center gap-2 font-semibold"><Cookie className="size-5 text-brand" aria-hidden />{t("consent.title")}</h2>
      <p id="cc-text" className="mt-1 text-sm text-muted">
        {t("consent.text")}{" "}
        <Link href="/legal/cookies" className="text-brand underline">{t("consent.policy")}</Link>
      </p>
      {custom && (
        <div className="mt-3 space-y-2 text-sm">
          <label className="flex items-center gap-2 opacity-70"><input type="checkbox" checked disabled className="size-4" />{t("consent.necessary")}</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} className="size-4 accent-[var(--brand)]" />{t("consent.analytics")}</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={ads} onChange={(e) => setAds(e.target.checked)} className="size-4 accent-[var(--brand)]" />{t("consent.ads")}</label>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={buttonClass("primary", "sm")} onClick={() => choose({ analytics: true, ads: true })}>{t("consent.acceptAll")}</button>
        <button type="button" className={buttonClass("secondary", "sm")} onClick={() => choose({ analytics: false, ads: false })}>{t("consent.necessaryOnly")}</button>
        {custom
          ? <button type="button" className={buttonClass("ghost", "sm")} onClick={() => choose({ analytics, ads })}>{t("consent.save")}</button>
          : <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setCustom(true)}>{t("consent.customise")}</button>}
      </div>
    </div>
  );
}

/** Footer link that reopens the consent dialog. */
export function CookieSettingsLink({ label = "Cookie settings" }: { label?: string }) {
  return <button type="button" onClick={() => window.dispatchEvent(new Event("wc-consent-open"))} className="hover:text-text">{label}</button>;
}

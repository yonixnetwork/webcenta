"use client";

import { useEffect } from "react";
import { useI18n } from "@/i18n/client";
import { LOCALE_COOKIE } from "@/i18n/locales";

/**
 * A signed-in user's saved language on a new device: remembered in the cookie so the next page
 * opens in that language. It never reloads the current page, and an explicit choice on this
 * device (the cookie) always wins.
 */
export function LocaleSync({ account }: { account: string | null }) {
  const { enabled } = useI18n();
  useEffect(() => {
    if (!account || !enabled.includes(account) || document.cookie.includes(`${LOCALE_COOKIE}=`)) return;
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(account)}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax${secure}`;
  }, [account, enabled]);
  return null;
}

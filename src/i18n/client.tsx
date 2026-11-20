"use client";

import NextLink from "next/link";
import { createContext, useContext, useMemo, type ComponentProps } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DEFAULT_LOCALE, localeInfo, localizePath, splitLocalePath } from "./locales";
import { createT, type Catalog, type T } from "./translate";

interface I18nValue { locale: string; t: T; enabled: readonly string[]; suggest: boolean; signedIn: boolean }
const I18n = createContext<I18nValue>({ locale: DEFAULT_LOCALE, t: (k) => k, enabled: [DEFAULT_LOCALE], suggest: false, signedIn: false });

/** Gives client components the current language and the "common" catalogue (only that one). */
export function I18nProvider({ locale, messages, fallback, enabled, suggest = false, signedIn = false, children }: { locale: string; messages: Catalog; fallback: Catalog; enabled: readonly string[]; suggest?: boolean; signedIn?: boolean; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, t: createT(locale, messages, fallback), enabled, suggest, signedIn }), [locale, messages, fallback, enabled, suggest, signedIn]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}

export function useT(): T { return useContext(I18n).t; }
export function useI18n(): I18nValue { return useContext(I18n); }
export function useLocale(): string { return useContext(I18n).locale; }
export function useDir(): "ltr" | "rtl" { return localeInfo(useContext(I18n).locale).dir; }

/** The current path without the language prefix ("/es/apps" → "/apps"). */
export function useBarePathname(): string {
  return splitLocalePath(usePathname() ?? "/").path;
}

/**
 * next/link that keeps the visitor's language: internal paths get the current prefix
 * ("/apps" → "/es/apps"). External URLs, anchors and non-localised paths are unchanged.
 */
export function Link({ href, ...props }: ComponentProps<typeof NextLink>) {
  const locale = useLocale();
  const target = typeof href === "string" ? localizePath(href, locale) : href;
  return <NextLink href={target} {...props} />;
}
export default Link;

/** useRouter() whose push/replace keep the current language. */
export function useLocalizedRouter() {
  const router = useRouter();
  const locale = useLocale();
  return useMemo(() => ({
    ...router,
    push: (href: string, opts?: Parameters<typeof router.push>[1]) => router.push(localizePath(href, locale), opts),
    replace: (href: string, opts?: Parameters<typeof router.replace>[1]) => router.replace(localizePath(href, locale), opts),
  }), [router, locale]);
}

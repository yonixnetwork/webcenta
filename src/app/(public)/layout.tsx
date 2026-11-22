import { cookies } from "next/headers";
import { MobileNav } from "@/components/mobile-nav";
import { buildId } from "@/server/build-id";
import { developerOrigin } from "@/lib/hosts";
import { BirthDatePrompt } from "@/components/account/birth-date-prompt";
import { PwaManager } from "@/components/pwa";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getCategoryTree } from "@/server/catalog/categories";
import { getCurrentUser, touchLastSeen } from "@/server/auth/session";
import { unreadCount } from "@/server/community/notifications";
import { siteInfo } from "@/server/settings/site";
import { ThirdPartyScripts } from "@/components/third-party-scripts";
import { CookieConsent } from "@/components/cookie-consent";
import { CONSENT_COOKIE, parseConsent } from "@/lib/consent";
import { I18nProvider } from "@/i18n/client";
import { clientMessages } from "@/i18n/server";
import { loadCatalog } from "@/i18n/catalogs";
import { i18nSettings } from "@/server/i18n/settings";
import { LanguageSuggest } from "@/components/language-menu";
import { LocaleSync } from "@/components/locale-sync";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const cookie = jar.get("wc-theme")?.value;
  const consentDecided = parseConsent(jar.get(CONSENT_COOKIE)?.value) !== null;
  const theme = cookie === "light" || cookie === "dark" ? cookie : "system";
  // "Suggested searches": real category names (no fabricated popularity).
  const tree = await getCategoryTree("AGE_16_PLUS").catch(() => []);
  const user = await getCurrentUser();
  if (user) void touchLastSeen(user);
  const headerUser = user ? { name: user.name, email: user.email, unread: await unreadCount(user.id) } : null;
  const suggested = tree.slice(0, 6).map((c) => c.name);
  const site = await siteInfo();
  // Admin → Settings → General → Site banner (or SITE_BANNER); a development notice when unset.
  const [intl, i18n] = await Promise.all([clientMessages(), i18nSettings()]);
  // The suggestion is written in the language it suggests (three short strings per language).
  const suggestLabels = Object.fromEntries(await Promise.all(i18n.enabled.map(async (code) => {
    const c = await loadCatalog(code, "common");
    const en = await loadCatalog("en", "common");
    const pick = (k: string) => (typeof c[k] === "string" ? c[k] : en[k]) as string;
    return [code, { suggest: pick("language.suggest"), switch: pick("language.switch"), dismiss: pick("language.dismiss") }];
  })));
  const banner = site.banner ?? (process.env.NODE_ENV !== "production" ? "Development build — listings marked “Sample” are fictional." : "");
  return (
    <I18nProvider locale={intl.locale} messages={intl.messages} fallback={intl.fallback} enabled={i18n.enabled} suggest={i18n.suggest} signedIn={Boolean(user)}>
      <LanguageSuggest labels={suggestLabels} />
      <LocaleSync account={user?.locale ?? null} />
      {banner && <div className="bg-warning-soft px-4 py-1.5 text-center text-xs font-medium text-warning">{banner}</div>}
      <SiteHeader theme={theme} suggested={suggested} user={headerUser} developerUrl={developerOrigin()} />
      {user && !user.birthDate && <BirthDatePrompt />}
      <main id="main" className="mx-auto min-h-[60vh] max-w-7xl px-4 pb-10 pt-4 sm:px-6 sm:pt-6">{children}</main>
      <SiteFooter name={site.name} contactEmail={site.contactEmail} socialLinks={site.socialLinks} />
      <MobileNav />
      <PwaManager build={buildId()} account={user?.id ?? ""} />
      <ThirdPartyScripts />
      <CookieConsent decided={consentDecided} />
    </I18nProvider>
  );
}

import { Link } from "@/i18n/client";
import { getT } from "@/i18n/server";
import { LanguageSelect } from "./language-menu";
import { Logo } from "./logo";
import { CookieSettingsLink } from "./cookie-consent";

const SOCIAL_LABEL: Record<string, string> = { x: "X", facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn", youtube: "YouTube", tiktok: "TikTok", github: "GitHub" };

export async function SiteFooter({ name = "Webcenta", contactEmail, socialLinks = [] }: { name?: string; contactEmail?: string; socialLinks?: Array<{ key: string; url: string }> }) {
  const t = await getT("common");
  return (
    <footer className="mt-16 border-t border-border bg-surface pb-[calc(6rem+env(safe-area-inset-bottom))] sm:pb-0">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-[2fr_1fr_1fr] sm:px-6">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-sm text-sm text-muted">{t("footer.tagline")}</p>
          <LanguageSelect />
        </div>
        <div>
          <h2 className="text-sm font-semibold">{t("footer.explore")}</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li><Link href="/categories" className="hover:text-text">{t("footer.allCategories")}</Link></li>
            <li><Link href="/search?sort=newest" className="hover:text-text">{t("footer.newApps")}</Link></li>
            <li><Link href="/search" className="hover:text-text">{t("footer.search")}</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Webcenta</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li><Link href="/about" className="hover:text-text">{t("footer.about")}</Link></li>
            <li><Link href="/developer" className="hover:text-text">{t("footer.developers")}</Link></li>
            <li><Link href="/contact" className="hover:text-text">{t("footer.contact")}</Link></li>
            <li><Link href="/legal/terms" className="hover:text-text">{t("footer.terms")}</Link></li>
            <li><Link href="/legal/privacy" className="hover:text-text">{t("footer.privacy")}</Link></li>
            <li><Link href="/legal/content" className="hover:text-text">{t("footer.content")}</Link></li>
            <li><Link href="/legal/cookies" className="hover:text-text">{t("footer.cookies")}</Link> · <CookieSettingsLink label={t("footer.cookieSettings")} /></li>
            <li><Link href="/legal" className="hover:text-text">{t("footer.allPolicies")}</Link></li>
            {contactEmail && <li><a href={`mailto:${contactEmail}`} className="hover:text-text">{contactEmail}</a></li>}
          </ul>
          {socialLinks.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted" aria-label={t("footer.social", { name })}>
              {socialLinks.map((l) => <li key={l.key}><a href={l.url} rel="me noopener" target="_blank" className="hover:text-text">{SOCIAL_LABEL[l.key] ?? l.key}</a></li>)}
            </ul>
          )}
        </div>
      </div>
      <p className="border-t border-border py-4 text-center text-xs text-subtle">© {new Date().getUTCFullYear()} {name}</p>
    </footer>
  );
}

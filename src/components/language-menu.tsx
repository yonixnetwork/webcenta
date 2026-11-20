"use client";

import { Globe, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBarePathname, useI18n } from "@/i18n/client";
import { LOCALE_COOKIE, localeInfo, localizePath, matchLanguage } from "@/i18n/locales";
import { saveLocaleAction } from "@/server/actions/locale";

/**
 * Switches the language: remembers the choice (a first-party cookie, and the account for
 * signed-in users) and opens the same page in that language. A full page load, so the
 * document's lang and dir attributes and every server-rendered text change together.
 */
function useSwitch() {
  const { signedIn } = useI18n();
  const path = useBarePathname();
  return async (code: string) => {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(code)}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax${secure}`;
    try { localStorage.setItem("wc-lang-suggest", "done"); } catch { /* storage unavailable */ }
    if (signedIn) await saveLocaleAction(code).catch(() => undefined);
    location.assign(localizePath(path, code) + location.search + location.hash);
  };
}

/** Native select (footer, account menu and settings): accessible on every device. */
export function LanguageSelect({ className }: { className?: string }) {
  const { locale, enabled, t } = useI18n();
  const choose = useSwitch();
  const id = useId();
  if (enabled.length < 2) return null;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted"><Globe className="size-3.5" aria-hidden />{t("language.label")}</label>
      <select id={id} value={locale} onChange={(e) => void choose(e.target.value)} data-testid="language-select"
        className="w-full max-w-xs rounded-xl border border-border bg-surface px-3 py-2 text-sm">
        {enabled.map((code) => { const l = localeInfo(code); return <option key={code} value={code} lang={l.code}>{l.native}</option>; })}
      </select>
    </div>
  );
}

/** Header button with the language list in a small dialog. */
export function LanguageMenu() {
  const { locale, enabled, t } = useI18n();
  const choose = useSwitch();
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>("[aria-current=true], button")?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  if (enabled.length < 2) return null;
  const current = localeInfo(locale);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} aria-label={`${t("language.choose")} (${current.native})`} data-testid="language-button"
        className="grid size-10 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-text">
        <Globe className="size-5" aria-hidden />
      </button>
      {/* A portal: the header's backdrop-filter would otherwise become the containing block of this fixed overlay. */}
      {open && createPortal(
        <div className="fixed inset-0 z-[60] grid place-items-end bg-black/40 sm:place-items-center" onClick={() => setOpen(false)}>
          <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="lang-title" onClick={(e) => e.stopPropagation()}
            className="max-h-[80dvh] w-full overflow-y-auto rounded-t-3xl bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-pop sm:max-w-lg sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="lang-title" className="font-bold">{t("language.choose")}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("action.close")} className="grid size-9 place-items-center rounded-full bg-surface-2"><X className="size-4" aria-hidden /></button>
            </div>
            <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3">
              {enabled.map((code) => {
                const l = localeInfo(code);
                return (
                  <li key={code}>
                    <button type="button" lang={l.code} dir={l.dir} aria-current={code === locale} onClick={() => void choose(code)}
                      className="w-full rounded-xl px-3 py-2 text-start text-sm hover:bg-surface-2 aria-[current=true]:bg-brand-soft aria-[current=true]:font-semibold aria-[current=true]:text-brand">
                      {l.native}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * "View Webcenta in Español?" when the browser prefers another available language. Only a
 * suggestion: nothing changes until the visitor chooses, and dismissing it is remembered.
 */
export function LanguageSuggest({ labels }: { labels: Record<string, { suggest: string; switch: string; dismiss: string }> }) {
  const { locale, enabled, suggest } = useI18n();
  const choose = useSwitch();
  const [target, setTarget] = useState<string | null>(null);
  useEffect(() => {
    if (!suggest) return;
    let done = false;
    try { done = localStorage.getItem("wc-lang-suggest") === "done"; } catch { /* storage unavailable */ }
    if (done || document.cookie.includes(`${LOCALE_COOKIE}=`)) return;
    const best = matchLanguage(navigator.languages ?? [navigator.language], enabled);
    queueMicrotask(() => setTarget(best && best !== locale ? best : null));
  }, [enabled, locale, suggest]);
  if (!target) return null;
  const l = localeInfo(target);
  const text = labels[target] ?? labels.en!;
  const dismiss = () => { setTarget(null); try { localStorage.setItem("wc-lang-suggest", "done"); } catch { /* ignore */ } };
  return (
    <div role="region" aria-label={text.suggest.replace("{language}", l.native)} lang={l.code} dir={l.dir} data-testid="language-suggest"
      className="border-b border-border bg-brand-soft/60 px-4 py-2 text-sm">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <span>{text.suggest.replace("{language}", l.native)}</span>
        <button type="button" onClick={() => void choose(target)} className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-brand-contrast">{text.switch}</button>
        <button type="button" onClick={dismiss} className="text-xs font-medium text-muted underline">{text.dismiss}</button>
      </div>
    </div>
  );
}

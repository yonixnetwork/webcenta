"use client";

import { Bell, Download, RefreshCw, Share, X } from "lucide-react";
import { enablePush, pushSupported, syncPush } from "@/lib/push-client";
import { useEffect, useState } from "react";
import { buttonClass } from "./ui/button";

interface BeforeInstallPromptEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }

/**
 * Registers the service worker, shows an update prompt when a new version is
 * waiting, and offers installation: the native prompt where supported
 * (Chromium on Android/Windows/macOS/Linux), or Add-to-Home-Screen instructions
 * on iOS/iPadOS Safari (which has no install prompt API).
 */
export function PwaManager({ build, account = "" }: { build: string; account?: string }) {
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [iosEligible, setIosEligible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  /** The newer build id that is running on the server, when this page is older. */
  const [deployed, setDeployed] = useState<string | null>(null);
  // The install suggestion waits until the cookie question has been answered.
  const [consented, setConsented] = useState(true);
  // Offer push notifications once (after the cookie question, and not together with the install banner).
  const [pushAsk, setPushAsk] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    // Defer state updates out of the effect body (react-hooks/set-state-in-effect).
    queueMicrotask(() => {
      setIosEligible(/iphone|ipad|ipod/i.test(ua) && !standalone);
      try { setDismissed(localStorage.getItem("wc-install-dismissed") === "1"); } catch { /* storage unavailable */ }
      setConsented(document.cookie.includes("wc-consent="));
      try {
        // Not on the first pages of a first visit: only after a few page views, never while the
        // browser has already decided (granted/denied), and back off after "Not now".
        const views = Number(localStorage.getItem("wc-pv") ?? "0") + 1;
        localStorage.setItem("wc-pv", String(views));
        const snoozedUntil = Number(localStorage.getItem("wc-push-snooze") ?? "0");
        const declines = Number(localStorage.getItem("wc-push-declines") ?? "0");
        setPushAsk(pushSupported() && Notification.permission === "default" && views >= 3 && declines < 2 && Date.now() > snoozedUntil);
      } catch { /* storage unavailable */ }
    });
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallEvt(e as BeforeInstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setInstallEvt(null));
    const onConsent = () => setConsented(true);
    window.addEventListener("wc-consent", onConsent);

    if ("serviceWorker" in navigator && location.hostname !== "admin.localhost" && !location.hostname.startsWith("admin.")) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          nw?.addEventListener("statechange", () => { if (nw.state === "installed" && navigator.serviceWorker.controller) setWaiting(nw); });
        });
      }).catch(() => undefined);
      // Keep an existing push subscription valid and linked to whoever is signed in now.
      void syncPush(account);
      // Reload only when an existing worker is replaced by an update (not on first install).
      const hadController = Boolean(navigator.serviceWorker.controller);
      let reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
    }
    // A new deployment: compare the build this page was made with against the running server.
    // `build` is the id the server rendered this page with; /api/version reports the running one.
    const check = async () => {
      if (build === "dev" || document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const { build: latest } = (await r.json()) as { build?: string };
        if (!latest || latest === "dev" || latest === build) return;
        // Loop guard: if this tab already reloaded for that build and still has an older page (a
        // stale copy from a cache), do not ask again in this session.
        let applied: string | null = null;
        try { applied = sessionStorage.getItem("wc-update-applied"); } catch { /* storage unavailable */ }
        if (applied !== latest) setDeployed(latest);
      } catch { /* offline */ }
    };
    const timer = window.setInterval(check, 10 * 60_000);
    document.addEventListener("visibilitychange", check);
    window.setTimeout(check, 3000);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("wc-consent", onConsent);
    };
  }, [build, account]);

  /** Clears this site's caches and the service worker's copy, then loads the new version. */
  const reloadFresh = async () => {
    try { if (deployed) sessionStorage.setItem("wc-update-applied", deployed); } catch { /* storage unavailable */ }
    try {
      if ("caches" in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
      if (reg?.waiting) { reg.waiting.postMessage("SKIP_WAITING"); return; } // controllerchange reloads
    } catch { /* fall through to a plain reload */ }
    location.reload();
  };

  /** "Not now": ask again in two weeks at most once more, then never (the native prompt is only shown on "Enable"). */
  const closePush = (declined: boolean) => {
    setPushAsk(false);
    try {
      if (declined) localStorage.setItem("wc-push-declines", String(Number(localStorage.getItem("wc-push-declines") ?? "0") + 1));
      localStorage.setItem("wc-push-snooze", String(Date.now() + (declined ? 14 : 3650) * 86_400_000));
    } catch { /* ignore */ }
  };
  const installShown = !dismissed && consented && (installEvt || iosEligible) && !waiting && !deployed;

  const dismiss = () => { setDismissed(true); try { localStorage.setItem("wc-install-dismissed", "1"); } catch { /* ignore */ } };

  return (
    <>
      {(waiting || deployed) && (
        <div role="status" data-testid="update-banner" className="fixed inset-x-4 bottom-28 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-brand/30 bg-surface p-3 shadow-pop sm:bottom-6">
          <span className="flex items-start gap-2 text-sm"><RefreshCw className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden /><span><strong>Webcenta has been updated.</strong> Reload to get the latest improvements.</span></span>
          <button type="button" className={buttonClass("primary", "sm")} onClick={() => (waiting ? waiting.postMessage("SKIP_WAITING") : void reloadFresh())}>Reload</button>
        </div>
      )}
      {!dismissed && consented && (installEvt || iosEligible) && !waiting && !deployed && (
        <div className="fixed inset-x-4 bottom-28 z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-2 shadow-pop sm:bottom-6" data-testid="install-banner">
          <Download className="size-5 shrink-0 text-brand" aria-hidden />
          <p className="flex-1 text-sm font-medium">Add Webcenta to your home screen</p>
          <button type="button" className={buttonClass("primary", "sm")} onClick={async () => {
            if (installEvt) { await installEvt.prompt(); await installEvt.userChoice; setInstallEvt(null); }
            else setShowIos(true);
          }}>Install</button>
          <button type="button" aria-label="Dismiss" onClick={dismiss} className="text-subtle hover:text-text"><X className="size-4" aria-hidden /></button>
        </div>
      )}
      {pushAsk && consented && !installShown && !waiting && !deployed && (
        <div className="fixed inset-x-4 bottom-28 z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-2 shadow-pop sm:bottom-6" data-testid="push-banner">
          <Bell className="size-5 shrink-0 text-brand" aria-hidden />
          <p className="flex-1 text-sm">Stay updated with new applications, trending tools and discoveries on Webcenta.</p>
          <span className="flex shrink-0 flex-col gap-1">
            <button type="button" className={buttonClass("primary", "sm")} onClick={async () => { await enablePush(); closePush(false); }}>Enable notifications</button>
            <button type="button" onClick={() => closePush(true)} className="text-xs font-medium text-muted hover:text-text">Not now</button>
          </span>
        </div>
      )}
      {showIos && (
        <div role="dialog" aria-modal="true" aria-labelledby="ios-title" className="fixed inset-0 z-50 grid place-items-end bg-black/40 p-4 sm:place-items-center" onClick={() => setShowIos(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-pop" onClick={(e) => e.stopPropagation()}>
            <h2 id="ios-title" className="text-lg font-bold">Add Webcenta to your Home Screen</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted">
              <li>Tap the <Share className="inline size-4 align-[-2px]" aria-label="Share" /> Share button in Safari’s toolbar.</li>
              <li>Scroll and choose <strong className="text-text">Add to Home Screen</strong>.</li>
              <li>Tap <strong className="text-text">Add</strong>.</li>
            </ol>
            <button type="button" className={buttonClass("secondary", "md", "mt-4 w-full")} onClick={() => setShowIos(false)}>Got it</button>
          </div>
        </div>
      )}
    </>
  );
}

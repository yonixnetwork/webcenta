"use client";

import { Download, Share, X } from "lucide-react";
import { useEffect, useState } from "react";
import { buttonClass } from "./ui/button";

interface BeforeInstallPromptEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }

/**
 * Registers the service worker, shows an update prompt when a new version is
 * waiting, and offers installation: the native prompt where supported
 * (Chromium on Android/Windows/macOS/Linux), or Add-to-Home-Screen instructions
 * on iOS/iPadOS Safari (which has no install prompt API).
 */
export function PwaManager() {
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [iosEligible, setIosEligible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    // Defer state updates out of the effect body (react-hooks/set-state-in-effect).
    queueMicrotask(() => {
      setIosEligible(/iphone|ipad|ipod/i.test(ua) && !standalone);
      try { setDismissed(localStorage.getItem("wc-install-dismissed") === "1"); } catch { /* storage unavailable */ }
    });
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallEvt(e as BeforeInstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setInstallEvt(null));

    if ("serviceWorker" in navigator && location.hostname !== "admin.localhost" && !location.hostname.startsWith("admin.")) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          nw?.addEventListener("statechange", () => { if (nw.state === "installed" && navigator.serviceWorker.controller) setWaiting(nw); });
        });
      }).catch(() => undefined);
      let reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloaded) { reloaded = true; location.reload(); } });
    }
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const dismiss = () => { setDismissed(true); try { localStorage.setItem("wc-install-dismissed", "1"); } catch { /* ignore */ } };

  return (
    <>
      {waiting && (
        <div role="status" className="fixed inset-x-4 bottom-20 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-3 shadow-pop sm:bottom-6">
          <span className="text-sm">A new version of WebCenter is available.</span>
          <button type="button" className={buttonClass("primary", "sm")} onClick={() => waiting.postMessage("SKIP_WAITING")}>Reload</button>
        </div>
      )}
      {!dismissed && (installEvt || iosEligible) && !waiting && (
        <div className="fixed inset-x-4 bottom-20 z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-pop sm:bottom-6" data-testid="install-banner">
          <Download className="size-5 shrink-0 text-brand" aria-hidden />
          <p className="flex-1 text-sm">Install WebCenter for quick access. It is a web app, not an app-store app.</p>
          <button type="button" className={buttonClass("primary", "sm")} onClick={async () => {
            if (installEvt) { await installEvt.prompt(); await installEvt.userChoice; setInstallEvt(null); }
            else setShowIos(true);
          }}>Install</button>
          <button type="button" aria-label="Dismiss" onClick={dismiss} className="text-subtle hover:text-text"><X className="size-4" aria-hidden /></button>
        </div>
      )}
      {showIos && (
        <div role="dialog" aria-modal="true" aria-labelledby="ios-title" className="fixed inset-0 z-50 grid place-items-end bg-black/40 p-4 sm:place-items-center" onClick={() => setShowIos(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-pop" onClick={(e) => e.stopPropagation()}>
            <h2 id="ios-title" className="text-lg font-bold">Add WebCenter to your Home Screen</h2>
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

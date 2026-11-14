"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui/cn";

/** The manager's rules, enforced against the real layout in the browser (see src/server/ads/manager.ts). */
export interface AdGuard { minSpacingPx: number; maxMobile: number; maxPage: number; mobile: boolean; desktop: boolean }

export interface AdSlotProps {
  placement: string;
  unit: string;
  width: number;
  height: number;
  minWidth: number;
  maxWidth?: number;
  provider: "adsense" | "adsterra";
  adsense?: { client: string; slot: string };
  adsterra?: { unit: string; isolation: "sandboxed" | "standard" };
  className?: string;
  guard: AdGuard;
  /** Compact native unit (app page): smaller reserved space and height cap. */
  compact?: boolean;
}

/**
 * Page-wide registry of ad slots. Slots register on mount; one evaluation pass, in document order,
 * decides which may load: one instance per placement, at least `minSpacingPx` between ads, and no
 * more than the page/screen maximum. Rejected slots collapse before anything is requested.
 */
type Entry = { id: string; placement: string; el: HTMLElement; guard: AdGuard; decide: (ok: boolean) => void; decided?: boolean; ok?: boolean };
const registry = new Map<string, Entry>();
let pending = 0;
function evaluate() {
  pending = 0;
  const entries = [...registry.values()].sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  const phone = window.innerWidth < 768;
  const kept: Entry[] = entries.filter((e) => e.decided && e.ok);
  const seen = new Set(kept.map((e) => e.placement));
  for (const e of entries) {
    if (e.decided) continue;
    const g = e.guard;
    const top = e.el.getBoundingClientRect().top + window.scrollY;
    const tooClose = kept.some((k) => Math.abs(k.el.getBoundingClientRect().top + window.scrollY - top) < g.minSpacingPx);
    const limit = phone ? Math.min(g.maxMobile, g.maxPage) : g.maxPage;
    // Hidden for this screen size (CSS) or outside the unit's width range: not an ad on this page.
    const shown = e.el.getClientRects().length > 0;
    const ok = shown && (phone ? g.mobile : g.desktop) && !seen.has(e.placement) && !tooClose && kept.length < limit;
    e.decided = true; e.ok = ok;
    if (ok) { kept.push(e); seen.add(e.placement); }
    e.decide(ok);
  }
}
function register(e: Entry) {
  registry.set(e.id, e);
  if (!pending) pending = window.setTimeout(evaluate, 0);
  return () => { registry.delete(e.id); };
}
let seq = 0;

/** Static class names per breakpoint (Tailwind needs literal strings): wide units never show on phones. */
function visibility(min: number, max?: number) {
  if (max === 499) return "flex min-[500px]:hidden";
  if (min === 500 && max === 1023) return "hidden min-[500px]:flex lg:hidden";
  if (min >= 1280) return "hidden xl:flex";
  if (min >= 1024) return "hidden lg:flex";
  return "flex";
}

declare global { interface Window { adsbygoogle?: unknown[] & { loaded?: boolean } } }

function report(placement: string, provider: string, reason: string) {
  try { navigator.sendBeacon?.("/api/ads/log", JSON.stringify({ placement, provider, reason })); } catch { /* ignore */ }
}

let adsenseScript: Promise<boolean> | null = null;
/** Loads adsbygoogle.js once per page; resolves false when it is blocked or times out. */
function loadAdsense(client: string): Promise<boolean> {
  if (adsenseScript) return adsenseScript;
  adsenseScript = new Promise((resolve) => {
    if (document.querySelector('script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]')) { resolve(true); return; }
    const s = document.createElement("script");
    s.async = true;
    s.crossOrigin = "anonymous";
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
    const t = window.setTimeout(() => resolve(false), 6000);
    s.onload = () => { window.clearTimeout(t); resolve(true); };
    s.onerror = () => { window.clearTimeout(t); resolve(false); };
    document.head.appendChild(s);
  });
  return adsenseScript;
}

/**
 * One ad placement. Space is reserved before anything loads (no layout shift), the ad loads only
 * when the placement is near the viewport and only on screens wide enough for its unit, and it
 * loads exactly once per mount (re-renders never reload it; leaving the page removes it).
 * Adsterra units run in their own sandboxed frame. If the provider is blocked or fails, the
 * reserved space collapses and the page carries on.
 */
export function AdSlot(p: AdSlotProps) {
  const box = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const [provider, setProvider] = useState<"adsense" | "adsterra" | "none">(p.provider);
  const reserved = p.compact ? 160 : p.height;
  const [frameHeight, setFrameHeight] = useState(reserved);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [instance] = useState(() => `ad-${++seq}`);

  // Register with the page-wide guard; it decides once whether this slot may load.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    return register({ id: instance, placement: p.placement, el, guard: p.guard, decide: (ok) => setAllowed(ok) });
  }, [instance, p.placement, p.guard]);

  useEffect(() => {
    const el = box.current;
    if (!el || started.current || allowed !== true) return;
    const fits = () => window.innerWidth >= p.minWidth && (p.maxWidth === undefined || window.innerWidth <= p.maxWidth);
    if (!fits()) return; // never load a unit that does not fit this screen
    let cancelled = false;
    let frame: HTMLIFrameElement | null = null;
    const onMessage = (e: MessageEvent) => {
      if (!frame || e.source !== frame.contentWindow) return;
      const h = Number((e.data as { webcentaAd?: boolean; height?: number })?.height);
      if ((e.data as { webcentaAd?: boolean })?.webcentaAd && h > 0) setFrameHeight(Math.min(p.compact ? 360 : 900, Math.max(p.unit === "native" ? 120 : p.height, h)));
    };

    const mountAdsterra = () => {
      if (!p.adsterra || cancelled) { setProvider("none"); return; }
      const host = el.querySelector<HTMLDivElement>("[data-ad-host]");
      if (!host) return;
      frame = document.createElement("iframe");
      frame.src = `/ads/frame/${p.adsterra.unit}`;
      frame.title = "Advertisement";
      frame.loading = "lazy";
      frame.referrerPolicy = "strict-origin-when-cross-origin";
      frame.setAttribute("scrolling", "no");
      // No allow-top-navigation: an ad can never redirect the page. Clicks open a new tab.
      frame.setAttribute("sandbox", `allow-scripts allow-popups allow-popups-to-escape-sandbox${p.adsterra.isolation === "standard" ? " allow-same-origin" : ""}`);
      frame.style.cssText = `border:0;display:block;width:${p.width ? `${p.width}px` : "100%"};max-width:100%;height:100%;overflow:hidden;background:transparent`;
      const timer = window.setTimeout(() => report(p.placement, "adsterra", "frame-timeout"), 12_000);
      frame.addEventListener("load", () => window.clearTimeout(timer));
      frame.addEventListener("error", () => { report(p.placement, "adsterra", "frame-error"); setProvider("none"); });
      window.addEventListener("message", onMessage);
      host.replaceChildren(frame);
    };

    const mountAdsense = async () => {
      if (!p.adsense) { setProvider("adsterra"); mountAdsterra(); return; }
      const ok = await loadAdsense(p.adsense.client);
      if (cancelled) return;
      const host = el.querySelector<HTMLDivElement>("[data-ad-host]");
      if (!ok || !host) { report(p.placement, "adsense", "script-blocked"); setProvider("adsterra"); mountAdsterra(); return; }
      const ins = document.createElement("ins");
      ins.className = "adsbygoogle";
      ins.style.cssText = `display:inline-block;width:${p.width ? `${p.width}px` : "100%"};height:${p.height}px`;
      ins.dataset.adClient = p.adsense.client;
      ins.dataset.adSlot = p.adsense.slot;
      host.replaceChildren(ins);
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch { report(p.placement, "adsense", "push-failed"); }
      // AdSense marks unfilled units; then (and only then) the placement switches to Adsterra once.
      window.setTimeout(() => {
        if (cancelled) return;
        if (ins.dataset.adStatus === "unfilled" || !ins.childElementCount) { report(p.placement, "adsense", "unfilled"); setProvider("adsterra"); mountAdsterra(); }
      }, 5000);
    };

    const start = () => {
      if (started.current) return;
      started.current = true;
      if (p.provider === "adsense") void mountAdsense(); else mountAdsterra();
    };
    const io = "IntersectionObserver" in window ? new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { io?.disconnect(); start(); } }, { rootMargin: "300px" }) : null;
    if (io) io.observe(el); else start();
    return () => {
      cancelled = true;
      io?.disconnect();
      window.removeEventListener("message", onMessage);
      el.querySelector("[data-ad-host]")?.replaceChildren();
    };
  }, [allowed, p.placement, p.provider, p.unit, p.width, p.height, p.minWidth, p.maxWidth, p.adsense, p.adsterra, p.compact]);

  if (provider === "none" || allowed === false) return null;
  return (
    <aside
      ref={box}
      aria-label="Advertisement"
      data-ad-placement={p.placement}
      data-ad-provider={provider}
      data-ad-state={allowed === null ? "pending" : "allowed"}
      className={cn(visibility(p.minWidth, p.maxWidth), "w-full max-w-full flex-col items-center gap-1 overflow-hidden", p.className)}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-subtle">Advertisement</span>
      <div
        data-ad-host
        className="flex max-w-full items-start justify-center overflow-hidden rounded-xl bg-surface-2/60"
        style={{ width: p.width ? p.width : "100%", height: frameHeight, maxWidth: "100%" }}
      />
    </aside>
  );
}

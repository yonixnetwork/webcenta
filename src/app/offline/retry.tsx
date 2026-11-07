"use client";

import { useCallback, useEffect, useState } from "react";
import { RotateCw, WifiOff } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

type Status = "idle" | "checking" | "still-offline";

/** Reloads the page the visitor wanted (not /offline) once the network answers. */
function reloadTarget() {
  if (window.location.pathname === "/offline") window.location.assign(new URL("/", window.location.href).href);
  else window.location.reload();
}

export function OfflineRetry() {
  const [status, setStatus] = useState<Status>("idle");

  const retry = useCallback(async () => {
    setStatus("checking");
    try {
      // A real network round trip (the service worker never caches /api/*).
      const res = await fetch("/api/health", { cache: "no-store" });
      if (res.ok) return reloadTarget();
    } catch {
      /* still offline */
    }
    setStatus("still-offline");
  }, []);

  useEffect(() => {
    // Come back automatically as soon as the browser reports a connection.
    const onOnline = () => void retry();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [retry]);

  return (
    <section aria-labelledby="offline-title" className="mt-16 text-center">
      <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-brand-soft text-brand"><WifiOff className="size-8" aria-hidden /></div>
      <h1 id="offline-title" className="mt-6 text-3xl font-extrabold tracking-tight">You&apos;re currently offline.</h1>
      <p className="mt-3 text-muted">Please check your internet connection and try again.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={retry} disabled={status === "checking"} className={buttonClass("primary", "md")}>
          <RotateCw className={`size-4 ${status === "checking" ? "animate-spin" : ""}`} aria-hidden />
          {status === "checking" ? "Checking connection…" : "Retry"}
        </button>
      </div>
      <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm text-muted">
        {status === "still-offline" ? "Still no connection. We’ll reload automatically when you’re back online." : ""}
      </p>
      <div className="mx-auto mt-8 max-w-md rounded-2xl border border-border bg-surface p-5 text-left text-sm text-muted">
        <h2 className="font-semibold text-text">Why am I seeing this?</h2>
        <p className="mt-2">Webcenta couldn’t reach the internet, so this page was loaded from your device. Search, app details, reviews, sign-in and your account need a connection and aren’t available offline.</p>
        <p className="mt-2">Nothing you were doing has been lost on our side. When your connection returns, the page you asked for will load again.</p>
      </div>
    </section>
  );
}

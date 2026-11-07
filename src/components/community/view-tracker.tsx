"use client";

import { useEffect } from "react";

/**
 * Records a listing view after the page is actually shown in a browser (bots and
 * prefetches that never run JS are not counted) and the dwell time on leave.
 */
export function ViewTracker({ slug, surface = "detail" }: { slug: string; surface?: string }) {
  useEffect(() => {
    const started = Date.now();
    fetch("/api/events/view", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, surface }), keepalive: true }).catch(() => undefined);
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      const dwellMs = Date.now() - started;
      if (dwellMs > 3000) navigator.sendBeacon?.("/api/events/dwell", new Blob([JSON.stringify({ slug, dwellMs })], { type: "application/json" }));
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [slug, surface]);
  return null;
}

"use client";

import { useEffect, useRef } from "react";

/**
 * Progressive enhancement for the filter <details>: it already opens and closes without
 * JavaScript; with it, a tap outside or Escape closes it, focus moves into the panel, and the
 * page behind a phone's bottom sheet does not scroll.
 */
export function FilterPanel({ children, defaultOpen = false }: { children: React.ReactNode; defaultOpen?: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const phone = () => window.matchMedia("(max-width: 639px)").matches;
    const sync = () => {
      document.documentElement.style.overflow = d.open && phone() ? "hidden" : "";
      if (d.open) d.querySelector<HTMLElement>("[data-filter-panel] input, [data-filter-panel] select")?.focus({ preventScroll: true });
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && d.open) { d.open = false; d.querySelector("summary")?.focus(); } };
    const onDown = (e: PointerEvent) => { if (d.open && !d.contains(e.target as Node)) d.open = false; };
    d.addEventListener("toggle", sync);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => { d.removeEventListener("toggle", sync); document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); document.documentElement.style.overflow = ""; };
  }, []);
  return <details ref={ref} className="group/filters relative" open={defaultOpen}>{children}</details>;
}

/** Closes the panel (the sheet's backdrop and its "Close" button). */
export function CloseFilters({ className, children, label }: { className?: string; children?: React.ReactNode; label: string }) {
  return <button type="button" aria-label={label} className={className} onClick={(e) => { const d = (e.currentTarget as HTMLElement).closest("details"); if (d) d.open = false; }}>{children}</button>;
}

/** The sort menu applies as soon as it changes (with JavaScript; otherwise via Apply/Sort). */
export function SortSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}

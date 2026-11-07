"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/cn";

export function AdminNav({ items }: { items: Array<{ href: string; label: string; badge?: number }> }) {
  const path = usePathname();
  return (
    <nav aria-label="Admin" className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
      {items.map((i) => {
        const active = i.href === "/" ? path === "/" : path === i.href || path.startsWith(`${i.href}/`);
        return (
          <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined} className={cn("flex shrink-0 items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-medium", active ? "bg-brand-soft text-brand" : "text-muted hover:bg-surface-2 hover:text-text")}>
            {i.label}{i.badge ? <span className="rounded-full bg-danger px-1.5 text-xs text-white">{i.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

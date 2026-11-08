"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/cn";

const ITEMS = [
  ["/", "Overview"], ["/listings/new", "Submit an app"], ["/domains", "Domains"], ["/analytics", "Analytics"],
  ["/reviews", "Reviews"], ["/claims", "Claim a listing"], ["/promote", "Plans & promotion"], ["/organization", "Organisation"], ["/account", "Account"],
] as const;

export function DevNav() {
  const path = usePathname();
  return (
    <nav aria-label="Developer portal" className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
      {ITEMS.map(([href, label]) => {
        const active = href === "/" ? path === href || path.startsWith("/listings/") && !path.endsWith("/new") : path.startsWith(href);
        return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("shrink-0 rounded-xl px-3 py-2 text-sm font-medium", active ? "bg-brand-soft text-brand" : "text-muted hover:bg-surface-2 hover:text-text")}>{label}</Link>;
      })}
    </nav>
  );
}

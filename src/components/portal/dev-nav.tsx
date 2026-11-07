"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/cn";

const ITEMS = [
  ["/developer", "Overview"], ["/developer/listings/new", "Submit an app"], ["/developer/domains", "Domains"], ["/developer/analytics", "Analytics"],
  ["/developer/reviews", "Reviews"], ["/developer/claims", "Claim a listing"], ["/developer/promote", "Plans & promotion"], ["/developer/organization", "Organisation"],
] as const;

export function DevNav() {
  const path = usePathname();
  return (
    <nav aria-label="Developer portal" className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
      {ITEMS.map(([href, label]) => {
        const active = href === "/developer" ? path === href || path.startsWith("/developer/listings/") && !path.endsWith("/new") : path.startsWith(href);
        return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("shrink-0 rounded-xl px-3 py-2 text-sm font-medium", active ? "bg-brand-soft text-brand" : "text-muted hover:bg-surface-2 hover:text-text")}>{label}</Link>;
      })}
    </nav>
  );
}

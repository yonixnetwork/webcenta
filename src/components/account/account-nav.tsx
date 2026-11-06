"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/cn";

const ITEMS = [
  ["/account", "Profile & security"], ["/account/favorites", "Favourites"], ["/account/collections", "Collections"],
  ["/account/reviews", "My reviews"], ["/account/notifications", "Notifications"], ["/account/history", "Recently viewed"],
  ["/account/reports", "My reports"], ["/account/privacy", "Privacy & data"], ["/developer", "Developer portal"],
] as const;

export function AccountNav({ unread }: { unread: number }) {
  const path = usePathname();
  return (
    <nav aria-label="Account" className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
      {ITEMS.map(([href, label]) => {
        const active = href === "/account" ? path === href : path.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={cn("shrink-0 rounded-xl px-3 py-2 text-sm font-medium", active ? "bg-brand-soft text-brand" : "text-muted hover:bg-surface-2 hover:text-text")}>
            {label}{href === "/account/notifications" && unread > 0 && <span className="ml-2 rounded-full bg-brand px-1.5 text-xs text-brand-contrast">{unread}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

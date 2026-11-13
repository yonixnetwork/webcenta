"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, Gamepad2, House, LayoutGrid, Search } from "lucide-react";
import { cn } from "./ui/cn";

// Categories are reached from the chips at the top of every browsing page, so they have no tab.
const TABS = [
  { href: "/", label: "Today", icon: House, match: (p: string) => p === "/" },
  { href: "/c/games", label: "Games", icon: Gamepad2, match: (p: string) => p.startsWith("/c/games") },
  { href: "/apps", label: "Apps", icon: LayoutGrid, match: (p: string) => p.startsWith("/apps") || p.startsWith("/categories") || (p.startsWith("/c/") && !p.startsWith("/c/games")) },
  { href: "/account/favorites", label: "Saved", icon: Bookmark, match: (p: string) => p.startsWith("/account/favorites") || p.startsWith("/account/collections") },
  { href: "/search", label: "Search", icon: Search, match: (p: string) => p.startsWith("/search") },
];

/** Floating, rounded tab bar on phones, in the style of the iOS App Store and Google Play. */
export function MobileNav() {
  const path = usePathname() ?? "/";
  return (
    // position: fixed on the viewport (outside the scrolling content, no transformed ancestor), above
    // the home indicator. translateZ keeps iOS from repainting it with the page during scroll.
    <nav aria-label="Mobile" className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 [transform:translateZ(0)] sm:hidden">
      <div className="mx-auto flex max-w-md items-stretch gap-1 rounded-full border border-border/70 bg-surface/90 p-1.5 shadow-pop backdrop-blur-xl supports-[backdrop-filter]:bg-surface/80">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match(path);
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined}
              className={cn("flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-1.5 text-[10.5px] font-semibold transition",
                active ? "bg-brand-soft text-brand" : "text-muted hover:text-text")}>
              <Icon className="size-[22px]" strokeWidth={active ? 2.4 : 2} aria-hidden />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

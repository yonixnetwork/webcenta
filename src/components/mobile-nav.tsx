"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gamepad2, House, LayoutGrid, Search, UserRound } from "lucide-react";
import { cn } from "./ui/cn";

const TABS = [
  { href: "/", label: "Today", icon: House, match: (p: string) => p === "/" },
  { href: "/categories", label: "Categories", icon: LayoutGrid, match: (p: string) => p.startsWith("/categories") || (p.startsWith("/c/") && !p.startsWith("/c/games")) },
  { href: "/c/games", label: "Games", icon: Gamepad2, match: (p: string) => p.startsWith("/c/games") },
  { href: "/search", label: "Search", icon: Search, match: (p: string) => p.startsWith("/search") },
  { href: "/account", label: "You", icon: UserRound, match: (p: string) => p.startsWith("/account") || p === "/signin" || p === "/signup" },
];

/** Floating, rounded tab bar on phones, in the style of the iOS App Store and Google Play. */
export function MobileNav() {
  const path = usePathname() ?? "/";
  return (
    <nav aria-label="Mobile" className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 sm:hidden">
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

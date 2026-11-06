import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { HeaderSearch } from "./header-search";
import { ThemeToggle } from "./theme-toggle";
import { Logo } from "./logo";

export function SiteHeader({ theme, suggested }: { theme: "system" | "light" | "dark"; suggested: string[] }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-bg/85 backdrop-blur supports-[backdrop-filter]:bg-bg/70">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
        <Link href="/" aria-label="WebCenter home" className="shrink-0"><Logo /></Link>
        <HeaderSearch suggested={suggested} className="hidden flex-1 md:block md:max-w-xl" />
        <nav aria-label="Main" className="ml-auto flex items-center gap-1">
          <Link href="/categories" className="hidden items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-text sm:inline-flex">
            <LayoutGrid className="size-4" aria-hidden /> Categories
          </Link>
          <ThemeToggle initial={theme} />
        </nav>
      </div>
      <HeaderSearch suggested={suggested} className="px-4 pb-3 md:hidden" />
    </header>
  );
}

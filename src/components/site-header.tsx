import Link from "next/link";
import { Bell, LayoutGrid } from "lucide-react";
import { HeaderSearch } from "./header-search";
import { ThemeToggle } from "./theme-toggle";
import { Logo } from "./logo";
import { AccountMenu } from "./account-menu";

export function SiteHeader({ theme, suggested, user, developerUrl }: { theme: "system" | "light" | "dark"; suggested: string[]; user: { name: string; email: string; unread: number } | null; developerUrl: string }) {
  return (
    <header className="sticky top-0 z-40 border-b pt-[env(safe-area-inset-top)] border-border/80 bg-bg/85 backdrop-blur supports-[backdrop-filter]:bg-bg/70">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <div className="mx-auto flex h-14 max-w-7xl sm:h-16 items-center gap-3 px-4 sm:gap-6 sm:px-6">
        <Link href="/" aria-label="Webcenta home" className="shrink-0"><Logo /></Link>
        <HeaderSearch suggested={suggested} className="hidden flex-1 md:block md:max-w-xl" />
        <nav aria-label="Main" className="ml-auto flex items-center gap-1">
          <Link href="/categories" className="hidden items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-text sm:inline-flex">
            <LayoutGrid className="size-4" aria-hidden /> Categories
          </Link>
          <ThemeToggle initial={theme} />
          {user ? (
            <>
              <Link href="/account/notifications" aria-label={`Notifications${user.unread ? ` (${user.unread} unread)` : ""}`} className="relative grid size-10 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-text">
                <Bell className="size-5" aria-hidden />
                {user.unread > 0 && <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-contrast">{user.unread > 9 ? "9+" : user.unread}</span>}
              </Link>
              <AccountMenu name={user.name} email={user.email} unread={user.unread} developerUrl={developerUrl} />
            </>
          ) : (
            <Link href="/signin" className="ml-1 rounded-xl bg-brand px-3.5 py-2 text-sm font-semibold text-brand-contrast hover:bg-brand-strong">Sign in</Link>
          )}
        </nav>
      </div>
    </header>
  );
}

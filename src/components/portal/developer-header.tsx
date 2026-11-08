import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/auth/auth-forms";

/** Header of the developer portal (developers.<host>): its own navigation, never the marketplace's. */
export function DeveloperHeader({ theme, user, marketplaceUrl }: { theme: "system" | "light" | "dark"; user: { name: string } | null; marketplaceUrl: string }) {
  return (
    <header className="border-b border-border bg-surface">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" aria-label="Developer portal home" className="flex shrink-0 items-center gap-2">
          <Logo />
          <span className="rounded-md bg-brand-soft px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-brand">Developers</span>
        </Link>
        <nav aria-label="Developer portal" className="ml-auto flex items-center gap-1 text-sm">
          <a href={marketplaceUrl} className="hidden rounded-xl px-3 py-2 font-medium text-muted hover:bg-surface-2 hover:text-text sm:inline-block">Marketplace ↗</a>
          <ThemeToggle initial={theme} />
          {user ? (
            <>
              <Link href="/account" className="rounded-xl px-3 py-2 font-medium text-muted hover:bg-surface-2 hover:text-text">Account</Link>
              <SignOutButton className="rounded-xl px-3 py-2 font-medium text-muted hover:bg-surface-2 hover:text-text" />
            </>
          ) : (
            <>
              <Link href="/signin" className="rounded-xl px-3 py-2 font-medium text-muted hover:bg-surface-2 hover:text-text">Sign in</Link>
              <Link href="/signup" className="rounded-xl bg-brand px-3 py-2 font-semibold text-brand-contrast hover:bg-brand-strong">Register</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

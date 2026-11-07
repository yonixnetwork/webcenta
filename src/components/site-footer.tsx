import Link from "next/link";
import { Logo } from "./logo";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border bg-surface">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-[2fr_1fr_1fr] sm:px-6">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-sm text-sm text-muted">
            WebCenter helps you discover and compare web applications. Listings credit their original publishers.
            Automated checks reduce risk but never guarantee that a website is safe.
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Explore</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li><Link href="/categories" className="hover:text-text">All categories</Link></li>
            <li><Link href="/search?sort=newest" className="hover:text-text">New apps</Link></li>
            <li><Link href="/search" className="hover:text-text">Search</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold">WebCenter</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li><Link href="/about" className="hover:text-text">About & how listings are checked</Link></li>
            <li><Link href="/developer" className="hover:text-text">Developer portal</Link></li>
            <li><Link href="/contact" className="hover:text-text">Contact & support</Link></li>
            <li><Link href="/legal/terms" className="hover:text-text">Terms</Link> · <Link href="/legal/privacy" className="hover:text-text">Privacy</Link> · <Link href="/legal/content" className="hover:text-text">Content policy</Link></li>
          </ul>
        </div>
      </div>
      <p className="border-t border-border py-4 text-center text-xs text-subtle">© {new Date().getUTCFullYear()} WebCenter</p>
    </footer>
  );
}

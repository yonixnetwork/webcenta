import Link from "next/link";
import { Compass, LayoutGrid, Search } from "lucide-react";

/** App-style bottom navigation on small screens. */
export function MobileNav() {
  const item = "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted hover:text-text";
  return (
    <nav aria-label="Mobile" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
      <div className="flex">
        <Link href="/" className={item}><Compass className="size-5" aria-hidden />Discover</Link>
        <Link href="/categories" className={item}><LayoutGrid className="size-5" aria-hidden />Categories</Link>
        <Link href="/search" className={item}><Search className="size-5" aria-hidden />Search</Link>
      </div>
    </nav>
  );
}

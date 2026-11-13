"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Bookmark, ChevronLeft, ChevronRight, Clock, Code2, Flag, FolderHeart, MessageSquareText, ShieldCheck, SlidersHorizontal, UserRound } from "lucide-react";
import { cn } from "@/components/ui/cn";

/** Every section of the account area (one screen each on phones). */
export const ACCOUNT_SECTIONS = [
  { href: "/account/profile", label: "Profile", hint: "Name, email and country", icon: UserRound },
  { href: "/account/security", label: "Security", hint: "Password, sign-in methods and activity", icon: ShieldCheck },
  { href: "/account/favorites", label: "Saved apps", hint: "Apps you saved", icon: Bookmark },
  { href: "/account/collections", label: "Collections", hint: "Your lists of apps", icon: FolderHeart },
  { href: "/account/reviews", label: "My reviews", hint: "Reviews you wrote", icon: MessageSquareText },
  { href: "/account/notifications", label: "Notifications", hint: "Messages and notification settings", icon: Bell },
  { href: "/account/history", label: "Recently viewed", hint: "Apps you looked at", icon: Clock },
  { href: "/account/reports", label: "My reports", hint: "Problems you reported", icon: Flag },
  { href: "/account/privacy", label: "Personalisation & privacy", hint: "Recommendations, data and deletion", icon: SlidersHorizontal },
] as const;

const isActive = (path: string, href: string) => path === href || path.startsWith(`${href}/`) || (href === "/account/profile" && path === "/account");

/** Desktop: the settings navigation in the left column. */
export function AccountNav({ unread, developerUrl }: { unread: number; developerUrl?: string }) {
  const path = usePathname() ?? "";
  return (
    <nav aria-label="Account" className="flex flex-col gap-0.5">
      {ACCOUNT_SECTIONS.map(({ href, label, icon: Icon }) => {
        const active = isActive(path, href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={cn("flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium", active ? "bg-brand-soft text-brand" : "text-muted hover:bg-surface-2 hover:text-text")}>
            <Icon className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {href === "/account/notifications" && unread > 0 && <span className="rounded-full bg-brand px-1.5 text-xs text-brand-contrast">{unread}</span>}
          </Link>
        );
      })}
      {developerUrl && <a href={developerUrl} className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-text"><Code2 className="size-4" aria-hidden />Developer portal</a>}
    </nav>
  );
}

/** Phones: the settings home is a list; each item opens its own screen. */
export function AccountMenuList({ unread, developerUrl }: { unread: number; developerUrl?: string }) {
  const row = "flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-surface-2";
  return (
    <nav aria-label="Account settings" className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <ul className="divide-y divide-border">
        {ACCOUNT_SECTIONS.map(({ href, label, hint, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className={row}>
              <Icon className="size-5 shrink-0 text-brand" aria-hidden />
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{label}</span><span className="block truncate text-xs text-muted">{hint}</span></span>
              {href === "/account/notifications" && unread > 0 && <span className="rounded-full bg-brand px-1.5 text-xs text-brand-contrast">{unread}</span>}
              <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
            </Link>
          </li>
        ))}
        {developerUrl && <li><a href={developerUrl} className={row}><Code2 className="size-5 shrink-0 text-brand" aria-hidden /><span className="min-w-0 flex-1 text-sm font-semibold">Developer portal</span><ChevronRight className="size-4 text-subtle" aria-hidden /></a></li>}
      </ul>
    </nav>
  );
}

/** Phones: "‹ Account" above a section screen (hidden on the settings home and on desktop). */
export function AccountBackLink() {
  const path = usePathname() ?? "";
  if (path === "/account") return null;
  return (
    <Link href="/account" className="-ml-1 inline-flex items-center gap-1 rounded-lg px-1 py-1 text-sm font-semibold text-brand lg:hidden">
      <ChevronLeft className="size-4" aria-hidden />Account
    </Link>
  );
}

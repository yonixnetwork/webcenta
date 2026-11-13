"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Bookmark, Clock, Code, Flag, FolderHeart, LogOut, MessageSquareText, ShieldCheck, SlidersHorizontal, UserRound, X } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { cn } from "./ui/cn";

const ITEMS = [
  { href: "/account/profile", label: "Profile & account settings", icon: UserRound },
  { href: "/account/security", label: "Security", icon: ShieldCheck },
  { href: "/account/favorites", label: "Saved apps", icon: Bookmark },
  { href: "/account/collections", label: "Collections", icon: FolderHeart },
  { href: "/account/reviews", label: "My reviews", icon: MessageSquareText },
  { href: "/account/notifications", label: "Notifications", icon: Bell, badge: true },
  { href: "/account/privacy", label: "Personalisation & privacy", icon: SlidersHorizontal },
  { href: "/account/history", label: "Recently viewed", icon: Clock },
  { href: "/account/reports", label: "My reports", icon: Flag },
] as const;

/**
 * Account menu: a bottom sheet on phones, an anchored panel on larger screens. It is an overlay
 * (rendered in a portal, position: fixed), so opening it never resizes or shifts the page or the
 * tab bar. Closes on Escape, on the backdrop and with the close button; focus stays inside while open.
 */
export function AccountMenu({ name, email, unread, developerUrl }: { name: string; email?: string; unread: number; developerUrl: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => { setOpen(false); button.current?.focus(); }, []);

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden"; // scrollbar-gutter: stable keeps the width unchanged
    panel.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      if (e.key === "Tab" && panel.current) {
        const f = [...panel.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")];
        if (!f.length) return;
        const first = f[0]!, last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => { root.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [open, close]);

  const initial = name.trim().charAt(0).toUpperCase() || "U";
  return (
    <>
      <button ref={button} type="button" aria-label={`Open account menu${unread ? ` (${unread} unread notification${unread === 1 ? "" : "s"})` : ""}`} aria-haspopup="dialog" aria-expanded={open}
        onClick={() => setOpen(true)}
        className="relative grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand to-accent text-sm font-bold text-white outline-offset-2">
        {initial}
        {unread > 0 && <span aria-hidden className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-bg bg-danger" />}
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[60]" data-testid="account-menu">
          <button type="button" aria-label="Close account menu" tabIndex={-1} onClick={close} className="absolute inset-0 size-full cursor-default bg-black/40 backdrop-blur-[2px] sm:bg-black/20" />
          <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="account-menu-title"
            className={cn(
              "absolute flex flex-col overflow-hidden bg-surface shadow-pop",
              // Phones: bottom sheet above the home indicator, scrolls inside when tall.
              "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-3xl pb-[env(safe-area-inset-bottom)]",
              // Larger screens: panel anchored under the header, top right.
              "sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-[calc(env(safe-area-inset-top)+4.25rem)] sm:max-h-[calc(100dvh-6rem)] sm:w-80 sm:rounded-2xl sm:border sm:border-border sm:pb-0",
            )}>
            <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-border sm:hidden" aria-hidden />
            <div className="flex items-center gap-3 border-b border-border px-5 py-4">
              <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand to-accent text-lg font-bold text-white">{initial}</span>
              <div className="min-w-0 flex-1">
                <p id="account-menu-title" className="truncate font-semibold">{name}</p>
                {email && <p className="truncate text-xs text-muted">{email}</p>}
              </div>
              <button type="button" onClick={close} aria-label="Close" className="grid size-9 place-items-center rounded-full bg-surface-2 text-muted hover:text-text"><X className="size-4" aria-hidden /></button>
            </div>
            <nav aria-label="Account" className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2">
              {ITEMS.map(({ href, label, icon: Icon, ...rest }) => (
                <Link key={href} href={href} onClick={() => setOpen(false)} className="flex items-center gap-3 px-5 py-3 text-sm font-medium hover:bg-surface-2 focus-visible:bg-surface-2">
                  <Icon className="size-5 text-muted" aria-hidden />
                  <span className="flex-1">{label}</span>
                  {"badge" in rest && unread > 0 && <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-brand-contrast">{unread > 99 ? "99+" : unread}<span className="sr-only"> unread</span></span>}
                </Link>
              ))}
              <a href={developerUrl} className="flex items-center gap-3 px-5 py-3 text-sm font-medium hover:bg-surface-2 focus-visible:bg-surface-2">
                <Code className="size-5 text-muted" aria-hidden /><span className="flex-1">Developer portal</span>
              </a>
            </nav>
            <div className="border-t border-border p-3">
              <button type="button" onClick={async () => { await authClient.signOut(); setOpen(false); router.push("/"); router.refresh(); }}
                className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-danger hover:bg-danger-soft">
                <LogOut className="size-4" aria-hidden />Sign out
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

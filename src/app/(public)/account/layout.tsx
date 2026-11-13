import type { Metadata } from "next";
import { AccountBackLink, AccountNav } from "@/components/account/account-nav";
import { developerOrigin } from "@/lib/hosts";
import { requireUser } from "@/server/auth/session";
import { unreadCount } from "@/server/community/notifications";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };

/**
 * Account area. Desktop: settings navigation on the left, the selected section on the right.
 * Phones: /account is a list of sections; each section is its own screen with a back link,
 * so no horizontal tab strip and never more than one section at a time.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/account");
  const unread = await unreadCount(user.id);
  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
      <aside className="hidden lg:block">
        <p className="mb-3 truncate text-sm text-muted">Signed in as <strong className="text-text">{user.email}</strong></p>
        <AccountNav unread={unread} developerUrl={developerOrigin()} />
      </aside>
      <div className="min-w-0 max-w-full space-y-6 [overflow-wrap:anywhere]">
        <AccountBackLink />
        {children}
      </div>
    </div>
  );
}

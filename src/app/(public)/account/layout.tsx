import type { Metadata } from "next";
import { AccountNav } from "@/components/account/account-nav";
import { requireUser } from "@/server/auth/session";
import { unreadCount } from "@/server/community/notifications";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/account");
  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <aside><p className="mb-3 hidden truncate text-sm text-muted lg:block">Signed in as <strong className="text-text">{user.email}</strong></p><AccountNav unread={await unreadCount(user.id)} /></aside>
      <div className="min-w-0 space-y-6">{children}</div>
    </div>
  );
}

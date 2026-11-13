import { SignOutButton } from "@/components/auth/auth-forms";
import { AccountMenuList } from "@/components/account/account-nav";
import { ProfileSection } from "@/components/account/sections";
import { FormMessage } from "@/components/ui/form";
import { developerOrigin } from "@/lib/hosts";
import { requireUser } from "@/server/auth/session";
import { unreadCount } from "@/server/community/notifications";

/** Phones: the list of account sections. Desktop: the profile (the navigation is on the left). */
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireUser("/account");
  const { welcome } = await searchParams;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight">Account</h1>
          <p className="truncate text-sm text-muted lg:hidden">{user.name} · {user.email}</p>
        </div>
        <SignOutButton />
      </div>
      {welcome && <FormMessage tone="success">Your email is confirmed. Welcome to Webcenta!</FormMessage>}
      <div className="lg:hidden"><AccountMenuList unread={await unreadCount(user.id)} developerUrl={developerOrigin()} /></div>
      <div className="hidden lg:block"><ProfileSection user={user} /></div>
    </>
  );
}

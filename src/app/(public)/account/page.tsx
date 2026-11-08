import { ChangePasswordForm, LinkedAccounts, SignOutEverywhere } from "@/components/account/security-panel";
import { SignOutButton } from "@/components/auth/auth-forms";
import { ActionForm } from "@/components/ui/action-form";
import { Card, Field, FormMessage, inputClass } from "@/components/ui/form";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { enabledSocialProviders } from "@/server/auth/user-auth";
import { updateProfileAction } from "@/server/actions/user";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireUser("/account");
  const { welcome } = await searchParams;
  const [logins, hasPassword] = await Promise.all([
    db.authEvent.findMany({ where: { userId: user.id, type: { in: ["LOGIN_SUCCESS", "LOGIN_FAILED"] } }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.account.count({ where: { userId: user.id, providerId: "credential" } }),
  ]);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">Profile & security</h1>
        <SignOutButton />
      </div>
      {welcome && <FormMessage tone="success">Your email is confirmed. Welcome to Webcenta!</FormMessage>}
      <Card>
        <h2 className="mb-4 font-semibold">Profile</h2>
        <ActionForm action={updateProfileAction} submitLabel="Save profile">
          <Field label="Display name" hint="Shown next to your reviews."><input name="name" required maxLength={80} defaultValue={user.name} className={inputClass} /></Field>
          <Field label="Email"><input value={user.email} disabled className={inputClass} readOnly /></Field>
          <Field label="Country (optional, ISO code)" hint="Used to show apps available to you when we cannot detect your country."><input name="preferredCountry" maxLength={2} defaultValue={user.preferredCountry ?? ""} className={`${inputClass} uppercase`} /></Field>
        </ActionForm>
      </Card>
      {hasPassword > 0 && <Card><h2 className="mb-4 font-semibold">Password</h2><ChangePasswordForm /></Card>}
      <Card><h2 className="mb-4 font-semibold">Sign-in methods</h2><LinkedAccounts providers={await enabledSocialProviders()} /></Card>
      <Card>
        <h2 className="mb-3 font-semibold">Recent sign-in activity</h2>
        <ul className="mb-4 divide-y divide-border text-sm">
          {logins.map((l) => (
            <li key={l.id} className="flex justify-between gap-3 py-2">
              <span className={l.type === "LOGIN_FAILED" ? "text-danger" : ""}>{l.type === "LOGIN_FAILED" ? "Failed attempt" : "Signed in"}</span>
              <span className="truncate text-muted">{formatDate(l.createdAt)} · {l.userAgent?.slice(0, 40) ?? "unknown device"}</span>
            </li>
          ))}
          {logins.length === 0 && <li className="py-2 text-muted">No activity recorded yet.</li>}
        </ul>
        <SignOutEverywhere />
      </Card>
    </>
  );
}

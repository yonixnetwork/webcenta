import { ChangePasswordForm, LinkedAccounts, SignOutEverywhere } from "@/components/account/security-panel";
import { ActionForm } from "@/components/ui/action-form";
import { Card, Field, inputClass } from "@/components/ui/form";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { enabledSocialProviders } from "@/server/auth/user-auth";
import { updateProfileAction } from "@/server/actions/user";

export const metadata = { title: "Account settings" };

/** Developer account settings: profile, password, sign-in methods and sessions (developer-portal session). */
export default async function DeveloperAccount() {
  const user = await requireUser("/account");
  const hasPassword = await db.account.count({ where: { userId: user.id, providerId: "credential" } });
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Account settings</h1>
      <Card>
        <h2 className="mb-4 font-semibold">Profile</h2>
        <ActionForm action={updateProfileAction} submitLabel="Save profile">
          <Field label="Display name"><input name="name" required maxLength={80} defaultValue={user.name} className={inputClass} /></Field>
          <Field label="Email"><input value={user.email} disabled className={inputClass} readOnly /></Field>
          <input type="hidden" name="preferredCountry" value={user.preferredCountry ?? ""} />
        </ActionForm>
      </Card>
      {hasPassword > 0 && <Card><h2 className="mb-4 font-semibold">Password</h2><ChangePasswordForm /></Card>}
      <Card><h2 className="mb-4 font-semibold">Sign-in methods</h2><LinkedAccounts providers={await enabledSocialProviders("developer")} /></Card>
      <Card><h2 className="mb-2 font-semibold">Sessions</h2><SignOutEverywhere /></Card>
    </>
  );
}

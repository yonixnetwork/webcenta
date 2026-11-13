import { ChangePasswordForm, LinkedAccounts, SignOutEverywhere } from "@/components/account/security-panel";
import { Reveal } from "@/components/account/reveal";
import { ActionForm } from "@/components/ui/action-form";
import { Card, Field, inputClass } from "@/components/ui/form";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import type { CurrentUser } from "@/server/auth/session";
import { enabledSocialProviders } from "@/server/auth/user-auth";
import { updateProfileAction } from "@/server/actions/user";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:gap-4"><dt className="w-40 shrink-0 text-sm text-muted">{label}</dt><dd className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">{children}</dd></div>;
}

/** Profile: the details as they are, with "Edit profile" to change them. */
export async function ProfileSection({ user }: { user: CurrentUser }) {
  const created = await db.user.findUnique({ where: { id: user.id }, select: { createdAt: true } });
  return (
    <Card>
      <h2 className="mb-2 font-semibold">Profile</h2>
      <Reveal label="Edit profile" closeLabel="Done" view={
        <dl className="divide-y divide-border">
          <Row label="Display name">{user.name}</Row>
          <Row label="Email">{user.email}</Row>
          <Row label="Country">{user.preferredCountry || <span className="text-muted">Not set (detected automatically)</span>}</Row>
          <Row label="Member since">{formatDate(created?.createdAt ?? null)}</Row>
        </dl>
      }>
        <ActionForm action={updateProfileAction} submitLabel="Save profile">
          <Field label="Display name" hint="Shown next to your reviews."><input name="name" required maxLength={80} defaultValue={user.name} className={inputClass} /></Field>
          <Field label="Email"><input value={user.email} disabled className={inputClass} readOnly /></Field>
          <Field label="Country (optional, ISO code)" hint="Used to show apps available to you when we cannot detect your country."><input name="preferredCountry" maxLength={2} defaultValue={user.preferredCountry ?? ""} className={`${inputClass} uppercase`} /></Field>
        </ActionForm>
      </Reveal>
    </Card>
  );
}

/** Security: password (form on request), sign-in methods and recent activity. */
export async function SecuritySection({ user }: { user: CurrentUser }) {
  const [logins, hasPassword, providers] = await Promise.all([
    db.authEvent.findMany({ where: { userId: user.id, type: { in: ["LOGIN_SUCCESS", "LOGIN_FAILED"] } }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.account.count({ where: { userId: user.id, providerId: "credential" } }),
    enabledSocialProviders(),
  ]);
  return (
    <>
      {hasPassword > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">Password</h2>
          <Reveal label="Change password" view={<p className="text-sm text-muted">Use a long password that you do not use anywhere else.</p>}>
            <ChangePasswordForm />
          </Reveal>
        </Card>
      )}
      <Card><h2 className="mb-4 font-semibold">Sign-in methods</h2><LinkedAccounts providers={providers} /></Card>
      <Card>
        <h2 className="mb-3 font-semibold">Recent sign-in activity</h2>
        <ul className="mb-4 divide-y divide-border text-sm">
          {logins.map((l) => (
            <li key={l.id} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:justify-between sm:gap-3">
              <span className={l.type === "LOGIN_FAILED" ? "text-danger" : ""}>{l.type === "LOGIN_FAILED" ? "Failed attempt" : "Signed in"}</span>
              <span className="min-w-0 truncate text-muted">{formatDate(l.createdAt)} · {l.userAgent?.slice(0, 40) ?? "unknown device"}</span>
            </li>
          ))}
          {logins.length === 0 && <li className="py-2 text-muted">No activity recorded yet.</li>}
        </ul>
        <SignOutEverywhere />
      </Card>
    </>
  );
}

import { redirect } from "next/navigation";
import { AdminAuthShell } from "@/components/portal/admin-auth-shell";
import { ActionForm } from "@/components/ui/action-form";
import { Field, inputClass } from "@/components/ui/form";
import { getAdmin, pendingMfaSession } from "@/server/admin/auth";
import { adminMfaAction } from "@/server/actions/admin";

export const metadata = { title: "Two-factor authentication" };

export default async function AdminMfa() {
  if (await getAdmin()) redirect("/");
  if (!(await pendingMfaSession())) redirect("/login");
  return (
    <AdminAuthShell title="Two-factor authentication" subtitle="Enter the 6-digit code from your authenticator app.">
      <ActionForm action={adminMfaAction} submitLabel="Verify" pendingLabel="Verifying…">
        <Field label="Authentication code"><input name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} autoFocus className={`${inputClass} text-center text-lg tracking-[0.4em]`} /></Field>
      </ActionForm>
    </AdminAuthShell>
  );
}

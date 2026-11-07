import { redirect } from "next/navigation";
import { AdminAuthShell } from "@/components/portal/admin-auth-shell";
import { ActionForm } from "@/components/ui/action-form";
import { Field, FormMessage, inputClass } from "@/components/ui/form";
import { getAdmin } from "@/server/admin/auth";
import { adminLoginAction } from "@/server/actions/admin";

export const metadata = { title: "Sign in" };

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ invited?: string }> }) {
  if (await getAdmin()) redirect("/");
  const { invited } = await searchParams;
  return (
    <AdminAuthShell title="Sign in" subtitle="Administrator accounts are separate from WebCenter user accounts.">
      {invited && <div className="mb-4"><FormMessage tone="success">Your administrator account is ready. Sign in to continue.</FormMessage></div>}
      <ActionForm action={adminLoginAction} submitLabel="Continue" pendingLabel="Checking…">
        <Field label="Email"><input name="email" type="email" required autoComplete="username" className={inputClass} /></Field>
        <Field label="Password"><input name="password" type="password" required autoComplete="current-password" className={inputClass} /></Field>
      </ActionForm>
    </AdminAuthShell>
  );
}

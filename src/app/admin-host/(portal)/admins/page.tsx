import { StepUpCard } from "@/components/portal/step-up-card";
import { ActionForm } from "@/components/ui/action-form";
import { Card, Field, inputClass } from "@/components/ui/form";
import { DataTable, StatusPill, td } from "@/components/portal/table";
import { InlineAction } from "@/components/portal/inline-action";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";
import { ROLE_LABEL } from "@/server/admin/permissions";
import { changeAdminRoleAction, inviteAdminAction, setAdminStatusAction } from "@/server/actions/admin";

export const metadata = { title: "Administrators" };
const ROLES = ["SUPER_ADMIN", "ADMIN", "MODERATOR", "SUPPORT_AGENT", "ANALYTICS_VIEWER"] as const;

export default async function AdminsPage() {
  const me = await requireAdmin("admins.manage");
  const [admins, invites, logins] = await Promise.all([
    db.adminUser.findMany({ orderBy: { createdAt: "asc" } }),
    db.adminInvitation.findMany({ where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }),
    db.adminLoginEvent.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { admin: { select: { email: true } } } }),
  ]);
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Administrators</h1>
      <StepUpCard />
      <Card>
        <h2 className="mb-2 font-semibold">Invite an administrator</h2>
        <ActionForm action={inviteAdminAction} submitLabel="Send invitation">
          <div className="grid gap-2 sm:grid-cols-[1fr_220px]"><Field label="Email"><input name="email" type="email" required className={inputClass} /></Field><Field label="Role"><select name="role" defaultValue="MODERATOR" className={inputClass}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field></div>
        </ActionForm>
        {invites.length > 0 && <p className="mt-3 text-sm text-muted">Pending: {invites.map((i) => `${i.email} (${ROLE_LABEL[i.role]}, expires ${formatDate(i.expiresAt)})`).join("; ")}</p>}
      </Card>
      <DataTable head={["Name", "Email", "Role", "Status", "MFA", "Last sign-in", "Actions"]}>
        {admins.map((a) => (
          <tr key={a.id}>
            <td className={td}>{a.name}{a.id === me.id && " (you)"}</td><td className={td}>{a.email}</td>
            <td className={td}>{a.id === me.id ? ROLE_LABEL[a.role] : (
              <ActionForm action={changeAdminRoleAction.bind(null, a.id)} submitLabel="Change" variant="ghost" className="flex items-center gap-1 space-y-0">
                <select name="role" defaultValue={a.role} aria-label="Role" className={`${inputClass} w-auto py-1`}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
              </ActionForm>
            )}</td>
            <td className={td}><StatusPill status={a.status} /></td><td className={td}>{a.totpEnabledAt ? "enabled" : "missing"}</td><td className={td}>{formatDate(a.lastLoginAt)}</td>
            <td className={td}>{a.id !== me.id && (a.status === "ACTIVE" ? <InlineAction action={setAdminStatusAction.bind(null, a.id, "SUSPENDED")} label="Suspend" confirmText={`Suspend ${a.email}?`} /> : <InlineAction action={setAdminStatusAction.bind(null, a.id, "ACTIVE")} label="Reactivate" />)}</td>
          </tr>
        ))}
      </DataTable>
      <h2 className="text-lg font-bold">Admin sign-in history</h2>
      <DataTable head={["When", "Email", "Result", "IP", "Device"]}>
        {logins.map((l) => <tr key={l.id}><td className={td}>{formatDate(l.createdAt)} {l.createdAt.toISOString().slice(11, 16)}</td><td className={td}>{l.emailAttempted}</td><td className={td}>{l.success ? <StatusPill status="PASS" /> : <span className="text-danger">{l.failureReason}</span>}</td><td className={td}>{l.ipAddress ?? "—"}</td><td className={td}>{l.userAgent?.slice(0, 40) ?? "—"}</td></tr>)}
      </DataTable>
    </>
  );
}

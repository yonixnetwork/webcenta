import { ActionForm } from "@/components/ui/action-form";
import { buttonClass } from "@/components/ui/button";
import { Card, Field, inputClass } from "@/components/ui/form";
import { DataTable, StatusPill, td } from "@/components/portal/table";
import { db } from "@/server/db";
import { canRole, requireDevPage } from "@/server/developer/context";
import { addMemberAction, removeMemberAction, updateOrgAction } from "@/server/actions/developer";

export const metadata = { title: "Organisation" };

export default async function OrganizationPage() {
  const ctx = await requireDevPage("ANALYST", "/developer/organization");
  const members = await db.developerMember.findMany({ where: { orgId: ctx.org.id }, include: { user: { select: { name: true, email: true } } } });
  const admin = canRole(ctx.role, "ADMIN");
  const o = ctx.org;
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Organisation</h1>
      <Card>
        <h2 className="mb-1 font-semibold">Verification</h2>
        <p className="text-sm text-muted"><StatusPill status={o.verificationLevel} /> Domain verification is automatic. Business verification is performed by Webcenta staff using registration or licence documents you upload on a listing.</p>
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">Public profile</h2>
        <ActionForm action={updateOrgAction} submitLabel="Save">
          <fieldset disabled={!admin} className="grid gap-3 sm:grid-cols-2">
            <Field label="Display name"><input name="displayName" required defaultValue={o.displayName} className={inputClass} /></Field>
            <Field label="Legal name"><input name="legalName" defaultValue={o.legalName ?? ""} className={inputClass} /></Field>
            <Field label="Website"><input name="websiteUrl" defaultValue={o.websiteUrl ?? ""} className={inputClass} /></Field>
            <Field label="Contact email"><input name="contactEmail" type="email" defaultValue={o.contactEmail ?? ""} className={inputClass} /></Field>
            <Field label="Country"><input name="countryCode" maxLength={2} defaultValue={o.countryCode ?? ""} className={`${inputClass} uppercase`} /></Field>
            <Field label="About" className="sm:col-span-2"><textarea name="bio" rows={3} maxLength={1000} defaultValue={o.bio ?? ""} className={inputClass} /></Field>
          </fieldset>
        </ActionForm>
      </Card>
      <h2 className="text-lg font-bold">Members</h2>
      <DataTable head={["Name", "Email", "Role", ""]}>
        {members.map((m) => (
          <tr key={m.userId}>
            <td className={td}>{m.user.name}</td><td className={td}>{m.user.email}</td><td className={td}>{m.role.toLowerCase()}</td>
            <td className={td}>{admin && m.role !== "OWNER" && m.userId !== ctx.user.id && <form action={removeMemberAction.bind(null, m.userId)}><button className={buttonClass("ghost", "sm")}>Remove</button></form>}</td>
          </tr>
        ))}
      </DataTable>
      {admin && (
        <Card>
          <h2 className="mb-3 font-semibold">Add a member</h2>
          <ActionForm action={addMemberAction} submitLabel="Add member">
            <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
              <Field label="Email of an existing Webcenta account"><input name="email" type="email" required className={inputClass} /></Field>
              <Field label="Role"><select name="role" className={inputClass}><option value="EDITOR">Editor</option><option value="ANALYST">Analyst (read-only)</option><option value="ADMIN">Admin</option></select></Field>
            </div>
          </ActionForm>
        </Card>
      )}
    </>
  );
}

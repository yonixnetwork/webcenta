import { ActionForm } from "@/components/ui/action-form";
import { Card, Field, inputClass } from "@/components/ui/form";
import { StatusPill } from "@/components/portal/table";
import { buttonClass } from "@/components/ui/button";
import { formatDate } from "@/lib/labels";
import { db } from "@/server/db";
import { requireAdmin } from "@/server/admin/auth";
import { rankingWeights } from "@/server/analytics/ranking";
import { broadcastAction, publishLegalPolicyAction, rankingWeightsAction, saveLegalPolicyAction } from "@/server/actions/admin";

export const metadata = { title: "Settings & legal" };
const TYPES = ["TERMS_OF_SERVICE", "PRIVACY_POLICY", "COOKIE_POLICY", "CONTENT_POLICY", "DEVELOPER_AGREEMENT", "REVIEW_GUIDELINES"] as const;

export default async function SettingsAdmin() {
  await requireAdmin("settings.manage");
  const [w, policies] = await Promise.all([rankingWeights(), db.legalPolicy.findMany({ orderBy: [{ type: "asc" }, { version: "desc" }] })]);
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Settings & legal</h1>
      <Card>
        <h2 className="mb-1 font-semibold">Organic ranking weights</h2>
        <p className="mb-3 text-sm text-muted">Only on-platform signals are used. Sponsored placements are never ranking inputs. Changes are audited with before/after values.</p>
        <ActionForm action={rankingWeightsAction} submitLabel="Save weights" variant="secondary">
          <div className="grid gap-2 sm:grid-cols-3">{Object.entries(w).map(([k, v]) => <Field key={k} label={k}><input name={k} type="number" step="0.1" min={0} max={100} defaultValue={v} className={inputClass} /></Field>)}</div>
        </ActionForm>
      </Card>
      <Card>
        <h2 className="mb-1 font-semibold">Announcement</h2>
        <p className="mb-3 text-sm text-muted">Sends an in-app notification (no email) to all active users or to developer members.</p>
        <ActionForm action={broadcastAction} submitLabel="Queue announcement" variant="secondary">
          <div className="grid gap-2 sm:grid-cols-[200px_1fr]"><Field label="Audience"><select name="audience" className={inputClass}><option value="DEVELOPERS">Developers</option><option value="ALL_USERS">All users</option></select></Field><Field label="Title"><input name="title" required className={inputClass} /></Field></div>
          <Field label="Message"><textarea name="body" rows={2} className={inputClass} /></Field>
        </ActionForm>
      </Card>
      <h2 className="text-lg font-bold">Legal policies</h2>
      <p className="text-sm text-warning">Policy texts must be reviewed by a qualified lawyer before publication. Webcenta does not claim legal compliance without that review.</p>
      {TYPES.map((t) => {
        const versions = policies.filter((p) => p.type === t);
        const latest = versions[0];
        return (
          <Card key={t} className="space-y-3">
            <h3 className="font-semibold">{t.replace(/_/g, " ").toLowerCase()}</h3>
            <ul className="space-y-1 text-sm">{versions.map((v) => <li key={v.id} className="flex flex-wrap items-center gap-2">v{v.version} “{v.title}” {v.publishedAt ? <StatusPill status="PUBLISHED" /> : <StatusPill status="DRAFT" />} {formatDate(v.createdAt)}{!v.publishedAt && <form action={publishLegalPolicyAction.bind(null, v.id)}><button className={buttonClass("ghost", "sm")}>Publish</button></form>}</li>)}</ul>
            <ActionForm action={saveLegalPolicyAction.bind(null, t)} submitLabel="Save new version" variant="secondary">
              <Field label="Title"><input name="title" required defaultValue={latest?.title} className={inputClass} /></Field>
              <Field label="Text (Markdown; rendered without HTML)"><textarea name="body" required rows={6} defaultValue={latest?.body} className={`${inputClass} font-mono text-xs`} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="publish" className="size-4 accent-[var(--brand)]" />Publish immediately</label>
            </ActionForm>
          </Card>
        );
      })}
    </>
  );
}

import { ActionForm, type FormState } from "@/components/ui/action-form";
import { Field, inputClass } from "@/components/ui/form";

type Cat = { name: string; slug: string; description: string | null; icon: string | null; emoji?: string | null; parentId: string | null; sortOrder: number; riskTier: string; defaultAgeRating: string; isEnabled: boolean; isRestricted: boolean; requiresManualReview: boolean; requiresComplianceDocs: boolean };

export function CategoryForm({ action, parents, initial, submitLabel }: { action: (s: FormState, f: FormData) => Promise<FormState>; parents: Array<{ id: string; name: string }>; initial?: Partial<Cat>; submitLabel: string }) {
  const c = initial ?? {};
  const check = "size-4 accent-[var(--brand)]";
  return (
    <ActionForm action={action} submitLabel={submitLabel}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name"><input name="name" required defaultValue={c.name} className={inputClass} /></Field>
        <Field label="Slug (blank = from name)"><input name="slug" defaultValue={c.slug} className={inputClass} /></Field>
        <Field label="Icon (lucide name)"><input name="icon" defaultValue={c.icon ?? ""} className={inputClass} /></Field>
        <Field label="Emoji (optional, one character)"><input name="emoji" defaultValue={c.emoji ?? ""} maxLength={16} className={inputClass} /></Field>
        <Field label="Parent"><select name="parentId" defaultValue={c.parentId ?? ""} className={inputClass}><option value="">— top level —</option>{parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Order"><input name="sortOrder" type="number" min={0} defaultValue={c.sortOrder ?? 0} className={inputClass} /></Field>
        <Field label="Risk tier"><select name="riskTier" defaultValue={c.riskTier ?? "LOW"} className={inputClass}>{["LOW", "MEDIUM", "HIGH", "PROHIBITED"].map((r) => <option key={r}>{r}</option>)}</select></Field>
        <Field label="Default age rating"><select name="defaultAgeRating" defaultValue={c.defaultAgeRating ?? "ALL_AGES"} className={inputClass}>{["ALL_AGES", "AGE_13_PLUS", "AGE_16_PLUS", "AGE_18_PLUS"].map((r) => <option key={r}>{r}</option>)}</select></Field>
        <Field label="Description" className="sm:col-span-2"><input name="description" defaultValue={c.description ?? ""} className={inputClass} /></Field>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="isEnabled" defaultChecked={c.isEnabled ?? true} className={check} />Enabled</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="isRestricted" defaultChecked={c.isRestricted} className={check} />Restricted (hidden pending legal review)</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="requiresManualReview" defaultChecked={c.requiresManualReview} className={check} />Requires manual review</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="requiresComplianceDocs" defaultChecked={c.requiresComplianceDocs} className={check} />Requires licence documents</label>
      </div>
    </ActionForm>
  );
}

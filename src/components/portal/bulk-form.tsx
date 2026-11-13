"use client";

import { useActionState } from "react";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { inputClass } from "@/components/ui/form";

interface State { ok: boolean; message: string }

/** The import table with select-all and bulk action buttons (each submits `op`). */
export function BulkForm({ action, categories, children }: { action: (s: State, f: FormData) => Promise<State>; categories: Array<{ id: string; label: string }>; children: React.ReactNode }) {
  const [state, formAction, pending] = useActionState(action, { ok: false, message: "" });
  const btn = (op: string, label: string, tone: "primary" | "secondary" | "ghost" = "secondary") => (
    <button type="submit" name="op" value={op} disabled={pending} className={buttonClass(tone, "sm")}>{label}</button>
  );
  return (
    <form action={formAction} className="space-y-3">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface p-3 shadow-card">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" className="size-4" aria-label="Select all rows" onChange={(e) => {
            e.currentTarget.form?.querySelectorAll<HTMLInputElement>('input[name="ids"]').forEach((c) => { c.checked = e.currentTarget.checked; });
          }} />All
        </label>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        {btn("publish", "Publish selected", "primary")}
        {btn("publish-all", "Publish all eligible")}
        {btn("review", "Send selected for review")}
        {btn("reject", "Reject selected")}
        {btn("archive", "Archive selected")}
        {btn("exclude", "Exclude selected")}
        {btn("import", "Import selected now")}
        <span className="flex items-center gap-1">
          <select name="categoryId" aria-label="Move to category" className={cn(inputClass, "w-48 py-1.5")} defaultValue="">
            <option value="" disabled>Move to category…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          {btn("category", "Move")}
        </span>
      </div>
      {state.message && <p role={state.ok ? "status" : "alert"} className={cn("rounded-xl px-3 py-2 text-sm", state.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>{state.message}</p>}
      <p className="text-xs text-subtle">&ldquo;Eligible&rdquo; = waiting for review, security checks finished without a failure, and not in a category that needs licence evidence. Publishing in bulk is limited per action (Settings).</p>
      {children}
    </form>
  );
}

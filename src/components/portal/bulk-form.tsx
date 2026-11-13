"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { inputClass } from "@/components/ui/form";

interface State { ok: boolean; message: string }

/** Actions that change listings ask for confirmation with the number of rows they affect. */
const CONFIRM: Record<string, (n: number, eligible: number) => string> = {
  publish: (n) => `Publish ${n} selected app(s)? Only eligible imports are published; the rest are listed in the result.`,
  "publish-all": (_n, e) => `Publish all ${e} eligible imported app(s) now?`,
  reject: (n) => `Reject ${n} selected app(s)?`,
  archive: (n) => `Archive ${n} selected app(s)? Published ones are removed from the marketplace.`,
  exclude: (n) => `Exclude ${n} selected queued website(s) from importing?`,
  category: (n) => `Move ${n} selected app(s) to the chosen category?`,
  "retry-all": () => "Queue every retryable failed import again?",
};

/**
 * The import table with selection and bulk actions. Every button submits `op` (rows submit
 * "op:<id>") through one server action, so each click shows a result or an error, buttons are
 * disabled while it runs (no double submissions), and the selection count is always visible.
 */
export function BulkForm({ action, categories, eligible, failed, children }: { action: (s: State, f: FormData) => Promise<State>; categories: Array<{ id: string; label: string }>; eligible: number; failed: number; children: React.ReactNode }) {
  const [state, formAction, pending] = useActionState(action, { ok: false, message: "" });
  const formRef = useRef<HTMLFormElement>(null);
  const [selected, setSelected] = useState(0);
  const boxes = () => [...(formRef.current?.querySelectorAll<HTMLInputElement>('input[name="ids"]') ?? [])];
  const recount = () => setSelected(boxes().filter((b) => b.checked).length);
  // After an action the table re-renders with new rows: clear the selection.
  useEffect(() => { boxes().forEach((b) => { b.checked = false; }); queueMicrotask(() => setSelected(0)); }, [state]);
  const setAll = (on: boolean) => { boxes().forEach((b) => { b.checked = on; }); recount(); };
  const btn = (op: string, label: string, tone: "primary" | "secondary" | "ghost" = "secondary", needsSelection = true) => (
    <button type="submit" name="op" value={op} disabled={pending || (needsSelection && selected === 0)} className={buttonClass(tone, "sm")}>{label}</button>
  );
  return (
    <form ref={formRef} action={formAction} className="space-y-3" onChange={recount} onSubmit={(e) => {
      const op = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value ?? "";
      const ask = CONFIRM[op.split(":")[0]!];
      if (ask && !window.confirm(ask(selected, eligible))) e.preventDefault();
    }}>
      <div className="sticky top-0 z-10 space-y-2 rounded-2xl border border-border bg-surface p-3 shadow-card">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <strong data-testid="selected-count" aria-live="polite">{selected} selected</strong>
          <button type="button" className="text-brand underline" onClick={() => setAll(true)}>Select all on this page</button>
          <button type="button" className="text-brand underline" onClick={() => setAll(false)} disabled={selected === 0}>Deselect all</button>
          {pending && <span role="status" className="text-muted">Working… this can take up to a minute for imports and checks.</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {btn("publish", "Publish selected", "primary")}
          {btn("publish-all", `Publish all eligible (${eligible})`, "secondary", false)}
          {btn("import", "Import selected now")}
          {btn("checks", "Run security checks")}
          {btn("retry", "Retry selected")}
          {btn("retry-all", `Retry all failed (${failed})`, "secondary", false)}
          {btn("review", "Require review")}
          {btn("exclude", "Exclude")}
          {btn("reject", "Reject")}
          {btn("archive", "Archive")}
          <span className="flex items-center gap-1">
            <select name="categoryId" aria-label="Move to category" className={cn(inputClass, "w-44 py-1.5")} defaultValue="">
              <option value="" disabled>Move to category…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            {btn("category", "Move")}
          </span>
        </div>
      </div>
      {state.message && <p role={state.ok ? "status" : "alert"} data-testid="bulk-result" className={cn("rounded-xl px-3 py-2 text-sm", state.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>{state.message}</p>}
      <p className="text-xs text-subtle">&ldquo;Eligible&rdquo; = imported and waiting for review, security checks finished without a failure, and not in a category that needs licence evidence. Imports whose checks have not run yet can be checked with &ldquo;Run security checks&rdquo; (3 per click; the scheduler checks the rest).</p>
      {children}
    </form>
  );
}

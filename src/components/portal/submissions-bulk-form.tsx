"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { startTransition as startFormTransition } from "react";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { inputClass } from "@/components/ui/form";
import { StepUpInput } from "@/components/ui/step-up-input";

interface State { ok: boolean; message: string; stepUp?: boolean }

const CONFIRM: Record<string, (n: number, eligible: number) => string> = {
  approve: (n) => `Approve and publish ${n} selected submission(s)? Records that fail any check are skipped and listed.`,
  "approve-all": (_n, e) => `Approve and publish all ${e} eligible submission(s)?`,
  reject: (n) => `Reject ${n} selected submission(s)? The developers receive your reason.`,
  info: (n) => `Ask the developers of ${n} selected submission(s) for more information?`,
  suspend: (n) => `Suspend ${n} selected published listing(s)? They disappear from the marketplace.`,
};

/** Submissions table with selection and bulk moderation. Eligibility is shown per row. */
export function SubmissionsBulkForm({ action, eligible, children }: { action: (s: State, f: FormData) => Promise<State>; eligible: number; children: React.ReactNode }) {
  const [state, formAction, pending] = useActionState(action, { ok: false, message: "" });
  const ref = useRef<HTMLFormElement>(null);
  const [selected, setSelected] = useState(0);
  const boxes = () => [...(ref.current?.querySelectorAll<HTMLInputElement>('input[name="ids"]') ?? [])];
  const recount = () => setSelected(boxes().filter((b) => b.checked).length);
  useEffect(() => { if (state.ok) { boxes().forEach((b) => { b.checked = false; }); queueMicrotask(() => setSelected(0)); } }, [state]);
  const pick = (fn: (b: HTMLInputElement) => boolean) => { boxes().forEach((b) => { b.checked = fn(b); }); recount(); };
  const btn = (op: string, label: string, tone: "primary" | "secondary" = "secondary", needsSelection = true) => (
    <button type="submit" name="op" value={op} disabled={pending || (needsSelection && selected === 0)} className={buttonClass(tone, "sm")}>{label}</button>
  );
  return (
    <form ref={ref} className="space-y-3" onChange={recount} onSubmit={(e) => {
      const op = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value ?? "";
      const ask = CONFIRM[op];
      e.preventDefault();
      if (ask && !window.confirm(ask(selected, eligible))) return;
      // Not React's form action: the selection and the reason stay if the server asks for a confirmation code.
      const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
      startFormTransition(() => formAction(data));
    }}>
      <div className="sticky top-0 z-10 space-y-2 rounded-2xl border border-border bg-surface p-3 shadow-card">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <strong data-testid="selected-count" aria-live="polite">{selected} selected</strong>
          <button type="button" className="text-brand underline" onClick={() => pick((b) => b.dataset.eligible === "1")}>Select all eligible</button>
          <button type="button" className="text-brand underline" onClick={() => pick(() => true)}>Select visible</button>
          <button type="button" className="text-brand underline" disabled={selected === 0} onClick={() => pick(() => false)}>Deselect all</button>
          {pending && <span role="status" className="text-muted">Working…</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {btn("approve", "Approve selected", "primary")}
          {btn("approve-all", `Approve all eligible (${eligible})`, "secondary", false)}
          {btn("info", "Request more information")}
          {btn("reject", "Reject selected")}
          {btn("suspend", "Suspend selected")}
        </div>
        <label className="block text-sm">
          <span className="text-muted">Reason for the developers (required to reject, request information or suspend)</span>
          <textarea name="notes" rows={2} maxLength={2000} className={cn(inputClass, "mt-1")} />
        </label>
      </div>
      <StepUpInput show={state.stepUp} />
      {state.message && <p role={state.ok ? "status" : "alert"} data-testid="bulk-result" className={cn("rounded-xl px-3 py-2 text-sm", state.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>{state.message}</p>}
      <p className="text-xs text-subtle">Bulk approval applies every individual check to every record: automated checks finished without a failure, no open security alert or report, complete details (logo and description), and not a category or risk level that needs individual review. Ineligible records are skipped with their reason.</p>
      {children}
    </form>
  );
}

"use client";

import { Flag } from "lucide-react";
import { useActionState, useState } from "react";
import { buttonClass } from "./ui/button";

export interface ReportState { ok: boolean; message: string }

export function ReportForm({ action, reasons }: {
  action: (state: ReportState, data: FormData) => Promise<ReportState>;
  reasons: ReadonlyArray<readonly [string, string]>;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, { ok: false, message: "" });

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("ghost", "sm")}>
        <Flag className="size-4" aria-hidden /> Report listing
      </button>
    );
  }
  if (state.ok) return <p role="status" className="rounded-xl bg-success-soft p-3 text-sm text-success">{state.message}</p>;

  return (
    <form action={formAction} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <h3 className="font-semibold">Report this listing</h3>
      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-sm text-muted">What is wrong?</legend>
        {reasons.map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input type="radio" name="reason" value={value} required className="accent-[var(--brand)]" /> {label}
          </label>
        ))}
      </fieldset>
      <label className="block text-sm">
        <span className="text-muted">Details (optional)</span>
        <textarea name="details" maxLength={2000} rows={3}
          className="mt-1 w-full rounded-xl border border-border bg-surface p-2 text-sm outline-none focus:border-brand" />
      </label>
      {/* Honeypot: hidden from people, often filled by bots. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      {state.message && <p role="alert" className="text-sm text-danger">{state.message}</p>}
      <p className="text-xs text-subtle">Reports are reviewed by the Webcenta team. Do not include personal information.</p>
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={buttonClass("primary", "sm")}>{pending ? "Sending…" : "Send report"}</button>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost", "sm")}>Cancel</button>
      </div>
    </form>
  );
}

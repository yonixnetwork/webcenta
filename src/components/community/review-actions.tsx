"use client";

import { Flag, MessageSquareReply, ThumbsUp, Trash2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { deleteReviewAction, helpfulAction } from "@/server/actions/user";
import { buttonClass } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form";
import type { FormState } from "@/components/ui/action-form";

export function HelpfulButton({ reviewId, slug, count, voted, disabled }: { reviewId: string; slug: string; count: number; voted: boolean; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" aria-pressed={voted} disabled={pending || disabled} className={buttonClass("ghost", "sm")}
        onClick={() => start(async () => { const r = await helpfulAction(reviewId, slug); setMsg(r.ok ? "" : r.message); })}>
        <ThumbsUp className={voted ? "size-4 fill-current" : "size-4"} aria-hidden /> Helpful ({count})
      </button>
      {msg && <span role="alert" className="text-xs text-danger">{msg}</span>}
    </span>
  );
}

export function DeleteReviewButton({ reviewId, slug }: { reviewId: string; slug: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} className={buttonClass("ghost", "sm")}
      onClick={() => { if (confirm("Delete your review?")) start(() => deleteReviewAction(reviewId, slug)); }}>
      <Trash2 className="size-4" aria-hidden /> Delete
    </button>
  );
}

export function ReportReviewButton({ action }: { action: (s: FormState, f: FormData) => Promise<FormState> }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, { ok: false, message: "" });
  if (state.ok) return <span role="status" className="text-xs text-success">{state.message}</span>;
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={buttonClass("ghost", "sm")}><Flag className="size-4" aria-hidden /> Report</button>;
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="rr">Reason</label>
      <select id="rr" name="reason" required className={`${inputClass} w-auto`} defaultValue="">
        <option value="" disabled>Reason…</option>
        <option value="SPAM">Spam</option><option value="FAKE_REVIEW">Fake or fraudulent</option>
        <option value="HARASSMENT">Harassment</option><option value="INAPPROPRIATE">Inappropriate</option><option value="OTHER">Other</option>
      </select>
      <button type="submit" disabled={pending} className={buttonClass("secondary", "sm")}>Send</button>
      {state.message && <span role="alert" className="text-xs text-danger">{state.message}</span>}
    </form>
  );
}

export function ReplyForm({ action, initial }: { action: (s: FormState, f: FormData) => Promise<FormState>; initial?: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, { ok: false, message: "" });
  if (state.ok) return <p role="status" className="text-sm text-success">{state.message}</p>;
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={buttonClass("ghost", "sm")}><MessageSquareReply className="size-4" aria-hidden /> {initial ? "Edit reply" : "Reply as developer"}</button>;
  return (
    <form action={formAction} className="mt-2 space-y-2">
      <label className="sr-only" htmlFor="reply-body">Developer reply</label>
      <textarea id="reply-body" name="body" required minLength={2} maxLength={2000} rows={3} defaultValue={initial} className={inputClass} />
      {state.message && <p role="alert" className="text-sm text-danger">{state.message}</p>}
      <button type="submit" disabled={pending} className={buttonClass("primary", "sm")}>Publish reply</button>
    </form>
  );
}

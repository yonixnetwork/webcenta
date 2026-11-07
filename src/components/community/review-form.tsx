"use client";

import { Star } from "lucide-react";
import { useActionState, useState } from "react";
import { buttonClass } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/form";
import type { FormState } from "@/components/ui/action-form";

export function ReviewForm({ action, initial }: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  initial?: { rating: number; title: string | null; body: string | null };
}) {
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [state, formAction, pending] = useActionState(action, { ok: false, message: "" });
  return (
    <form action={formAction} className="space-y-4 rounded-2xl border border-border bg-surface p-5">
      <h3 className="font-semibold">{initial ? "Edit your review" : "Write a review"}</h3>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Your rating</legend>
        <div className="flex gap-1" role="radiogroup">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer" title={`${n} star${n > 1 ? "s" : ""}`}>
              <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)} className="peer sr-only" aria-label={`${n} star${n > 1 ? "s" : ""}`} />
              <Star className={`size-7 transition peer-focus-visible:outline peer-focus-visible:outline-2 ${n <= rating ? "fill-amber-400 text-amber-400" : "text-subtle"}`} aria-hidden />
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Title (optional)"><input name="title" maxLength={120} defaultValue={initial?.title ?? ""} className={inputClass} /></Field>
      <Field label="Review (optional)" hint="Be specific and fair. Links will delay publication for moderation."><textarea name="body" rows={4} maxLength={4000} defaultValue={initial?.body ?? ""} className={inputClass} /></Field>
      {state.message && <p role={state.ok ? "status" : "alert"} className={`rounded-xl px-3 py-2 text-sm ${state.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>{state.message}</p>}
      <button type="submit" disabled={pending || rating === 0} className={buttonClass("primary", "md")}>{pending ? "Saving…" : initial ? "Update review" : "Publish review"}</button>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, inputClass } from "@/components/ui/form";

interface State { ok: boolean; message: string; link?: string }

export function SetupForm({ action, submitLabel, withEmail = false }: { action: (s: State, f: FormData) => Promise<State>; submitLabel: string; withEmail?: boolean }) {
  const [state, formAction, pending] = useActionState(action, { ok: false, message: "" });
  return (
    <form action={formAction} className="space-y-3" autoComplete="off">
      <Field label="Setup token" hint="The SETUP_TOKEN value from the hosting environment.">
        <input name="token" type="password" required minLength={32} autoComplete="off" className={inputClass} />
      </Field>
      {withEmail && <Field label="Your email (Super Administrator)"><input name="email" type="email" required autoComplete="email" className={inputClass} /></Field>}
      {state.message && <p role={state.ok ? "status" : "alert"} className={cn("rounded-xl px-3 py-2 text-sm", state.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>{state.message}</p>}
      {state.link && <p className="break-all rounded-xl border border-border bg-surface-2 p-3 font-mono text-xs"><a href={state.link} className="text-brand underline">{state.link}</a></p>}
      <button type="submit" disabled={pending} className={buttonClass("primary", "md")}>{pending ? "Working…" : submitLabel}</button>
    </form>
  );
}

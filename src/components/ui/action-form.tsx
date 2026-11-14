"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { buttonClass } from "./button";
import { cn } from "./cn";
import { StepUpInput } from "./step-up-input";

/**
 * `redirectTo` performs a FULL browser navigation. Used on the admin host, where a
 * server-action redirect() would be resolved without the host rewrite in proxy.ts.
 */
export interface FormState { ok: boolean; message: string; redirectTo?: string; stepUp?: boolean }

/** Generic form bound to a server action, with pending state and an accessible result message. */
export function ActionForm({ action, children, submitLabel, pendingLabel = "Saving…", className, variant = "primary", hideOnSuccess = false }: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  children?: React.ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  className?: string;
  variant?: "primary" | "secondary" | "ghost";
  hideOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: false, message: "" });
  const ref = useRef<HTMLFormElement>(null);
  // Clear the form only after success: when the server asks for a correction (or an authenticator
  // confirmation), what the person typed stays in place.
  useEffect(() => { if (state.ok) ref.current?.reset(); }, [state]);
  useEffect(() => {
    if (state.redirectTo && state.redirectTo.startsWith("/") && !state.redirectTo.startsWith("//")) window.location.assign(state.redirectTo);
  }, [state.redirectTo]);
  if (hideOnSuccess && state.ok) return <p role="status" className="rounded-xl bg-success-soft px-3 py-2 text-sm text-success">{state.message}</p>;
  return (
    <form ref={ref} className={cn("space-y-4", className)} onSubmit={(e) => {
      e.preventDefault();
      const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
      startTransition(() => formAction(data));
    }}>
      {children}
      <StepUpInput show={state.stepUp} />
      {state.message && (
        <p role={state.ok ? "status" : "alert"} className={cn("rounded-xl px-3 py-2 text-sm", state.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>{state.message}</p>
      )}
      <button type="submit" disabled={pending} className={buttonClass(variant, "md")}>{pending ? pendingLabel : submitLabel}</button>
    </form>
  );
}

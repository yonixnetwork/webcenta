"use client";

import { useActionState, useState } from "react";
import { StepUpInput } from "@/components/ui/step-up-input";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { inputClass } from "@/components/ui/form";

/** Serializable projection of a registry field plus its current (public) state. Never carries a secret value. */
export interface SettingsFieldView {
  key: string;
  label: string;
  help: string;
  type: "text" | "secret" | "url" | "email" | "number" | "boolean" | "select" | "textarea" | "color";
  required?: boolean;
  env?: string;
  defaultValue?: string;
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
  placeholder?: string;
  when?: { key: string; equals: string | boolean };
  multiline?: boolean;
  saved: string;
  effective: string;
  secretSet: boolean;
  source: "saved" | "env" | "default" | "none";
}

interface State { ok: boolean; message: string; stepUp?: boolean }
type Action = (s: State, f: FormData) => Promise<State>;

const SOURCE_LABEL = { saved: "Saved here", env: "From the hosting environment", default: "Default", none: "Not set" } as const;

function Result({ state }: { state: State }) {
  if (!state.message) return null;
  return <p role={state.ok ? "status" : "alert"} className={cn("rounded-xl px-3 py-2 text-sm", state.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>{state.message}</p>;
}

export function SettingsForm({ action, fields, toggle, enabled, readOnly, sectionTitle }: {
  action: Action;
  fields: SettingsFieldView[];
  toggle: boolean;
  enabled: boolean;
  readOnly: boolean;
  sectionTitle: string;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: false, message: "" });
  // Live values of fields other fields depend on (e.g. storage driver).
  const [live, setLive] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(fields.filter((f) => fields.some((o) => o.when?.key === f.key)).map((f) => [f.key, f.type === "boolean" ? f.effective === "true" : f.effective])),
  );
  const visible = (f: SettingsFieldView) => !f.when || live[f.when.key] === f.when.equals;

  return (
    <form action={formAction} className="space-y-5" autoComplete="off">
      {toggle && (
        <label className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm font-medium">
          <input type="hidden" name="b:__enabled" value="1" />
          <input type="checkbox" name="enabled" defaultChecked={enabled} disabled={readOnly} className="size-5 accent-[var(--brand)]" />
          Enable {sectionTitle}
        </label>
      )}
      <fieldset disabled={readOnly || pending} className="space-y-5">
        {fields.map((f) => {
          if (!visible(f)) return null;
          const id = `f-${f.key}`;
          const meta = (
            <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-subtle">
              <span>{f.help}</span>
              {f.type !== "secret" && f.type !== "boolean" && f.source !== "saved" && f.effective !== "" && <span>Currently: <code className="break-all">{f.effective}</code> ({SOURCE_LABEL[f.source].toLowerCase()})</span>}
              {f.env && <span>Environment fallback: <code>{f.env}</code></span>}
            </span>
          );
          if (f.type === "boolean") {
            return (
              <div key={f.key}>
                <input type="hidden" name={`b:${f.key}`} value="1" />
                <label htmlFor={id} className="flex items-center gap-3 text-sm font-medium">
                  <input id={id} type="checkbox" name={`v:${f.key}`} defaultChecked={f.effective === "true"} className="size-4 accent-[var(--brand)]"
                    onChange={(e) => setLive((l) => (f.key in l ? { ...l, [f.key]: e.target.checked } : l))} />
                  {f.label}
                </label>
                {meta}
              </div>
            );
          }
          if (f.type === "secret") {
            return (
              <div key={f.key} className="space-y-1.5 text-sm">
                <label htmlFor={id} className="font-medium">{f.label}{f.required && <span className="text-danger"> *</span>}</label>
                <p className="text-xs">
                  {f.secretSet
                    ? <span className="rounded-md bg-success-soft px-2 py-0.5 font-mono text-success">{f.effective}</span>
                    : <span className="rounded-md bg-warning-soft px-2 py-0.5 text-warning">Not set</span>}
                  {f.secretSet && <span className="ml-2 text-subtle">{SOURCE_LABEL[f.source]}. The value is never shown again; type a new one to replace it.</span>}
                </p>
                {f.multiline
                  ? <textarea id={id} name={`s:${f.key}`} rows={5} autoComplete="off" spellCheck={false} placeholder={f.secretSet ? "Leave empty to keep the current value" : "Paste the whole contents of the .p8 key file"} className={cn(inputClass, "font-mono text-xs")} />
                  : <input id={id} name={`s:${f.key}`} type="password" autoComplete="new-password" spellCheck={false} placeholder={f.secretSet ? "Leave empty to keep the current value" : f.placeholder ?? "Enter the value"} className={inputClass} />}
                {f.secretSet && f.source === "saved" && (
                  <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" name={`clear:${f.key}`} className="size-4" />Remove the saved value{f.env ? ` (falls back to ${f.env} if set)` : ""}</label>
                )}
                {meta}
              </div>
            );
          }
          const common = {
            id, name: `v:${f.key}`, defaultValue: f.saved, className: inputClass,
            placeholder: f.source !== "saved" && f.effective ? f.effective : f.placeholder,
          };
          return (
            <div key={f.key} className="space-y-1.5 text-sm">
              <label htmlFor={id} className="font-medium">{f.label}{f.required && <span className="text-danger"> *</span>}</label>
              {f.type === "select" ? (
                <select {...common} defaultValue={f.saved || f.effective} onChange={(e) => setLive((l) => (f.key in l ? { ...l, [f.key]: e.target.value } : l))}>
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : f.type === "textarea" ? (
                <textarea {...common} rows={3} maxLength={f.max} />
              ) : f.type === "color" ? (
                <div className="flex items-center gap-3">
                  <input {...common} type="text" pattern="#[0-9a-fA-F]{6}" className={cn(inputClass, "max-w-40 font-mono")} />
                  <span aria-hidden className="size-8 rounded-lg border border-border" style={{ background: f.effective }} />
                </div>
              ) : (
                <input {...common} type={f.type === "number" ? "number" : f.type === "email" ? "email" : f.type === "url" ? "url" : "text"} min={f.min} max={f.type === "number" ? f.max : undefined} maxLength={f.type !== "number" ? f.max : undefined} spellCheck={false} />
              )}
              {meta}
            </div>
          );
        })}
      </fieldset>
      <StepUpInput show={state.stepUp} />
      <Result state={state} />
      {!readOnly && <button type="submit" disabled={pending} className={buttonClass("primary", "md")}>{pending ? "Saving…" : "Save"}</button>}
      <p className="text-xs text-subtle">Empty fields use the hosting environment value or the default shown. Secrets are encrypted before they are stored and are never displayed again.</p>
    </form>
  );
}

export function TestButton({ action, disabled, label = "Test connection", pendingLabel = "Testing…" }: { action: (s: State) => Promise<State>; disabled?: boolean; label?: string; pendingLabel?: string }) {
  const [state, formAction, pending] = useActionState(action, { ok: false, message: "" });
  return (
    <form action={formAction} className="space-y-3">
      <button type="submit" disabled={pending || disabled} className={buttonClass("secondary", "md")}>{pending ? pendingLabel : label}</button>
      <Result state={state} />
    </form>
  );
}

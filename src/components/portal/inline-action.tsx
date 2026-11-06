"use client";

import { useState, useTransition } from "react";
import { buttonClass } from "@/components/ui/button";

/** A single button bound to a server action returning { ok, message }. */
export function InlineAction({ action, label, variant = "secondary", confirmText }: { action: () => Promise<{ ok: boolean; message: string }>; label: string; variant?: "primary" | "secondary" | "ghost"; confirmText?: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" disabled={pending} className={buttonClass(variant, "sm")} onClick={() => { if (confirmText && !confirm(confirmText)) return; start(async () => setMsg(await action())); }}>{pending ? "Working…" : label}</button>
      {msg?.message && <span role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-xs text-success" : "text-xs text-danger"}>{msg.message}</span>}
    </span>
  );
}

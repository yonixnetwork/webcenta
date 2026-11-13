"use client";

import { useState, useTransition } from "react";
import { buttonClass } from "@/components/ui/button";

export function CheckDomainButton({ action }: { action: () => Promise<{ ok: boolean; message: string }> }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <span className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={pending} className={buttonClass("secondary", "sm")} onClick={() => start(async () => setMsg(await action()))}>{pending ? "Checking…" : "Check verification"}</button>
      {msg && <span role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-sm text-success" : "text-sm text-danger"}>{msg.message}</span>}
    </span>
  );
}

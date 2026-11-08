"use client";

import { useTransition } from "react";
import { buttonClass } from "@/components/ui/button";

/** Signs out and performs a full navigation (keeps the admin host rewrite in effect). */
export function AdminLogoutButton({ action }: { action: () => Promise<void> }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} className={buttonClass("secondary", "sm")}
      onClick={() => start(async () => { await action(); window.location.assign(new URL("/login", window.location.href).href); })}>
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}

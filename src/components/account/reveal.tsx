"use client";

import { useState } from "react";
import { buttonClass } from "@/components/ui/button";

/**
 * Shows existing information with an action button ("Edit profile", "Change password"); the
 * form appears only after the button is pressed, with a Cancel/Done button to close it again.
 */
export function Reveal({ label, view, children, closeLabel = "Cancel" }: { label: string; view?: React.ReactNode; children: React.ReactNode; closeLabel?: string }) {
  const [open, setOpen] = useState(false);
  if (!open) return (
    <div className="space-y-4">
      {view}
      <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setOpen(true)} aria-expanded={false}>{label}</button>
    </div>
  );
  return (
    <div className="space-y-4">
      {children}
      <button type="button" className="text-sm font-medium text-muted underline hover:text-text" onClick={() => setOpen(false)} aria-expanded>{closeLabel}</button>
    </div>
  );
}

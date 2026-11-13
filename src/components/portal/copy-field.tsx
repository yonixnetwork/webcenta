"use client";

import { useState } from "react";
import { Check, Copy, Download } from "lucide-react";

/** A value to copy exactly (record value, meta tag, file content), with Copy and optional Download. */
export function CopyField({ label, value, download, testId }: { label: string; value: string; download?: string; testId?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{label}</p>
      <div className="flex min-w-0 items-stretch gap-2">
        <code data-testid={testId} className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-xs break-all whitespace-pre-wrap">{value}</code>
        <div className="flex shrink-0 flex-col gap-1">
          <button type="button" className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:border-brand" aria-label={`Copy ${label}`} onClick={async () => {
            try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard unavailable */ }
          }}>{copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}{copied ? "Copied" : "Copy"}</button>
          {download && (
            <button type="button" className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:border-brand" aria-label={`Download ${download}`} onClick={() => {
              const url = URL.createObjectURL(new Blob([value], { type: "text/html" }));
              const a = document.createElement("a");
              a.href = url; a.download = download; a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}><Download className="size-3.5" aria-hidden />Download</button>
          )}
        </div>
      </div>
    </div>
  );
}

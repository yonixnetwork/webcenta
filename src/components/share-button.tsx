"use client";

import { Check, Share2 } from "lucide-react";
import { useState } from "react";
import { buttonClass } from "./ui/button";

export function ShareButton({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* user cancelled */
    }
  }
  return (
    <button type="button" onClick={share} className={buttonClass("secondary", "md")}>
      {copied ? <Check className="size-4" aria-hidden /> : <Share2 className="size-4" aria-hidden />}
      <span>{copied ? "Link copied" : "Share"}</span>
      <span className="sr-only" aria-live="polite">{copied ? "Link copied to clipboard" : ""}</span>
    </button>
  );
}

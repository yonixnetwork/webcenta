"use client";

import { ErrorState } from "@/components/states";
import { buttonClass } from "@/components/ui/button";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState title="We couldn’t load this page">
      <p>This is usually temporary. Please try again.</p>
      <button type="button" onClick={reset} className={buttonClass("secondary", "sm", "mt-4")}>Try again</button>
    </ErrorState>
  );
}

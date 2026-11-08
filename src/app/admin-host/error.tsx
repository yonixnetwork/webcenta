"use client";

import { ServerErrorView } from "@/components/server-error-view";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main id="main"><ServerErrorView digest={error.digest} reset={reset} standalone admin /></main>;
}

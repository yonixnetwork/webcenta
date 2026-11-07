"use client";

import { ServerErrorView } from "@/components/server-error-view";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ServerErrorView digest={error.digest} reset={reset} />;
}

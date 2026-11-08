"use client";

import "./globals.css";
import { ServerErrorView } from "@/components/server-error-view";

/** Last-resort boundary (errors in the root layout). Must render its own <html> and <body>. */
export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <head><title>Something went wrong · Webcenta</title><meta name="robots" content="noindex" /></head>
      <body className="min-h-dvh bg-bg font-sans text-text">
        <main id="main"><ServerErrorView digest={error.digest} standalone /></main>
      </body>
    </html>
  );
}

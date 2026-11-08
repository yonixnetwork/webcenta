import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { OfflineRetry } from "./retry";

export const metadata: Metadata = { title: "You're offline", robots: { index: false } };

/**
 * Precached by the service worker (with its CSS and JS) and shown when a page
 * can't be loaded because the device has no connection.
 */
export default function OfflinePage() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 py-8 sm:px-6">
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full navigation when offline */}
      <a href="/" aria-label="Webcenta home" className="inline-flex self-start"><Logo /></a>
      <OfflineRetry />
    </main>
  );
}

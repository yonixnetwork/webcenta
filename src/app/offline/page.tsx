import type { Metadata } from "next";

export const metadata: Metadata = { title: "You are offline", robots: { index: false } };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- precached icon */}
      <img src="/icons/icon-192.png" alt="" width={72} height={72} className="rounded-2xl" />
      <h1 className="text-2xl font-extrabold tracking-tight">You are offline</h1>
      <p className="text-muted">Webcenta needs an internet connection to load apps and search. Pages you opened recently may still be available.</p>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full reload is intended when offline */}
      <a href="/" className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-contrast">Try again</a>
    </main>
  );
}

import type { Metadata } from "next";
import { Logo } from "@/components/logo";

export const metadata: Metadata = { title: "WebCenter for Developers", robots: { index: false, follow: false } };

/** developers.webcenter.com — placeholder until Phase 2 (accounts, submissions). */
export default function DeveloperHome() {
  const origin = process.env.PUBLIC_ORIGIN || "http://localhost:3000";
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo />
      <h1 className="text-3xl font-extrabold tracking-tight">WebCenter for Developers</h1>
      <p className="text-muted">Developer accounts, app submissions and domain verification are coming soon.</p>
      <a href={origin} className="text-sm font-semibold text-brand hover:underline">Browse the marketplace →</a>
    </main>
  );
}

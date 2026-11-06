import type { Metadata } from "next";
import { Logo } from "@/components/logo";

export const metadata: Metadata = { title: "WebCenter Admin", robots: { index: false, follow: false } };

/**
 * admin.webcenter.com — placeholder until Phase 3. There is deliberately no
 * sign-in or registration form: admin identity, invitations and MFA arrive in Phase 3.
 */
export default function AdminHome() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo />
      <h1 className="text-2xl font-bold">Administration</h1>
      <p className="text-sm text-muted">This portal is not available yet. Access is invitation-only.</p>
    </main>
  );
}

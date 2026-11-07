import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/auth-forms";
import { FormMessage } from "@/components/ui/form";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  return (
    <AuthShell title="Choose a new password">
      {token && !error ? <ResetPasswordForm token={token} /> : (
        <FormMessage>This reset link is invalid or has expired. <Link href="/forgot-password" className="underline">Request a new one</Link>.</FormMessage>
      )}
    </AuthShell>
  );
}

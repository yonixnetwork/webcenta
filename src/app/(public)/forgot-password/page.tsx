import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset your password" subtitle="Enter your account email and we will send you a reset link."
      footer={<Link href="/signin" className="font-semibold text-brand hover:underline">Back to sign in</Link>}>
      <ForgotPasswordForm />
    </AuthShell>
  );
}

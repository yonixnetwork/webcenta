import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/auth-forms";
import { isSafeRelativePath } from "@/lib/url";
import { getCurrentUser } from "@/server/auth/session";
import { enabledSocialProviders } from "@/server/auth/user-auth";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const next = sp.next && isSafeRelativePath(sp.next) ? sp.next : "/account";
  if (await getCurrentUser()) redirect(next);
  return (
    <AuthShell title="Create your account" subtitle="Browsing is free without an account. An account lets you save apps, build collections and review."
      footer={<>Already have an account? <Link href={`/signin?next=${encodeURIComponent(next)}`} className="font-semibold text-brand hover:underline">Sign in</Link></>}>
      <SignUpForm providers={enabledSocialProviders()} next={next} />
    </AuthShell>
  );
}

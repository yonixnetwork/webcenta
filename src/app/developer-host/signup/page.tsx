import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/auth-forms";
import { isSafeRelativePath } from "@/lib/url";
import { getCurrentUser } from "@/server/auth/session";
import { enabledSocialProviders, signupsAllowed } from "@/server/auth/user-auth";

export const metadata: Metadata = { title: "Register as a developer", robots: { index: false } };

export default async function DeveloperSignUp({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const next = sp.next && isSafeRelativePath(sp.next) ? sp.next : "/";
  if (await getCurrentUser()) redirect(next);
  return (
    <AuthShell title="Register as a developer" subtitle="Create your account, confirm your email, then set up your developer organisation."
      footer={<>Already registered? <Link href={`/signin?next=${encodeURIComponent(next)}`} className="font-semibold text-brand hover:underline">Sign in</Link></>}>
      {(await signupsAllowed())
        ? <SignUpForm providers={await enabledSocialProviders("developer")} next={next} />
        : <p role="status" className="rounded-lg border border-border bg-warning-soft p-4 text-sm">New accounts are not being accepted at the moment. Existing developers can still sign in.</p>}
    </AuthShell>
  );
}

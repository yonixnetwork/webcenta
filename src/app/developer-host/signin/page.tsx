import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/auth-forms";
import { isSafeRelativePath } from "@/lib/url";
import { getCurrentUser } from "@/server/auth/session";
import { enabledSocialProviders } from "@/server/auth/user-auth";

export const metadata: Metadata = { title: "Developer sign in", robots: { index: false } };

export default async function DeveloperSignIn({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = sp.next && isSafeRelativePath(sp.next) ? sp.next : "/";
  if (await getCurrentUser()) redirect(next);
  return (
    <AuthShell title="Developer sign in" subtitle="Manage your apps, submissions, reviews and analytics. Use your Webcenta account."
      footer={<>New here? <Link href={`/signup?next=${encodeURIComponent(next)}`} className="font-semibold text-brand hover:underline">Register as a developer</Link></>}>
      <SignInForm providers={await enabledSocialProviders("developer")} next={next} initialError={sp.error ? "Sign-in with that provider failed. Please try again." : undefined} />
    </AuthShell>
  );
}

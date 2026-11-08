"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { PROVIDER_LABEL, type SocialProvider } from "@/lib/social-providers";
import { buttonClass } from "@/components/ui/button";
import { Field, FormMessage, inputClass } from "@/components/ui/form";

function SocialButtons({ providers, next }: { providers: SocialProvider[]; next: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (providers.length === 0) return null;
  return (
    <div className="space-y-2">
      {providers.map((p) => (
        <button key={p} type="button" disabled={busy !== null} className={buttonClass("secondary", "lg", "w-full")}
          onClick={async () => {
            setBusy(p);
            await authClient.signIn.social({ provider: p, callbackURL: next, errorCallbackURL: "/signin?error=oauth" });
            setBusy(null);
          }}>
          Continue with {PROVIDER_LABEL[p]}
        </button>
      ))}
      <div className="flex items-center gap-3 py-2 text-xs text-subtle"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
    </div>
  );
}

export function SignInForm({ providers, next, initialError }: { providers: SocialProvider[]; next: string; initialError?: string }) {
  const router = useRouter();
  const [error, setError] = useState(initialError ?? "");
  const [unverified, setUnverified] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <div className="space-y-4">
      <SocialButtons providers={providers} next={next} />
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const email = String(f.get("email")), password = String(f.get("password"));
        setPending(true); setError(""); setUnverified("");
        const { error: err } = await authClient.signIn.email({ email, password, callbackURL: next });
        setPending(false);
        if (err) {
          if (err.status === 403) setUnverified(email);
          else if (err.status === 429) setError("Too many attempts. Please wait a few minutes and try again.");
          else setError("Incorrect email or password, or the account is suspended.");
          return;
        }
        router.push(next);
        router.refresh();
      }}>
        {error && <FormMessage>{error}</FormMessage>}
        {unverified && <FormMessage tone="info">Please confirm your email first. We have sent a new confirmation link to {unverified}.</FormMessage>}
        <Field label="Email"><input name="email" type="email" required autoComplete="email" className={inputClass} /></Field>
        <Field label="Password"><input name="password" type="password" required autoComplete="current-password" className={inputClass} /></Field>
        <div className="flex justify-end"><Link href="/forgot-password" className="text-sm font-medium text-brand hover:underline">Forgot password?</Link></div>
        <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "w-full")}>{pending ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}

export function SignUpForm({ providers, next }: { providers: SocialProvider[]; next: string }) {
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [pending, setPending] = useState(false);
  if (done) return <FormMessage tone="success">Account created. We sent a confirmation link to {done}. Open it to activate your account.</FormMessage>;
  return (
    <div className="space-y-4">
      <SocialButtons providers={providers} next={next} />
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const name = String(f.get("name")).trim(), email = String(f.get("email")).trim(), password = String(f.get("password"));
        if (password !== String(f.get("confirm"))) return setError("The passwords do not match.");
        if (!f.get("terms")) return setError("Please accept the terms to continue.");
        setPending(true); setError("");
        const { error: err } = await authClient.signUp.email({ name, email, password, callbackURL: `${next}${next.includes("?") ? "&" : "?"}welcome=1` });
        setPending(false);
        if (err) {
          setError(err.status === 422 || err.code === "USER_ALREADY_EXISTS" ? "An account with this email may already exist. Try signing in or resetting your password." :
            err.status === 429 ? "Too many attempts. Please try again later." : (err.message ?? "Could not create the account."));
          return;
        }
        setDone(email);
      }}>
        {error && <FormMessage>{error}</FormMessage>}
        <Field label="Name"><input name="name" required maxLength={80} autoComplete="name" className={inputClass} /></Field>
        <Field label="Email"><input name="email" type="email" required autoComplete="email" className={inputClass} /></Field>
        <Field label="Password" hint="At least 10 characters."><input name="password" type="password" required minLength={10} maxLength={128} autoComplete="new-password" className={inputClass} /></Field>
        <Field label="Confirm password"><input name="confirm" type="password" required minLength={10} autoComplete="new-password" className={inputClass} /></Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="terms" value="1" className="mt-0.5 size-4 accent-[var(--brand)]" />
          <span>I agree to the <Link href="/legal/terms" className="text-brand underline">Terms</Link> and have read the <Link href="/legal/privacy" className="text-brand underline">Privacy Policy</Link>.</span>
        </label>
        <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "w-full")}>{pending ? "Creating account…" : "Create account"}</button>
      </form>
    </div>
  );
}

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  if (sent) return <FormMessage tone="success">If an account exists for that email, a reset link is on its way. It expires in 1 hour.</FormMessage>;
  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault();
      setPending(true);
      await authClient.requestPasswordReset({ email: String(new FormData(e.currentTarget).get("email")), redirectTo: "/reset-password" });
      setPending(false);
      setSent(true); // same response whether or not the account exists
    }}>
      <Field label="Email"><input name="email" type="email" required autoComplete="email" className={inputClass} /></Field>
      <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "w-full")}>{pending ? "Sending…" : "Send reset link"}</button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  if (done) return <FormMessage tone="success">Your password has been changed and other sessions were signed out. <Link href="/signin" className="underline">Sign in</Link></FormMessage>;
  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const newPassword = String(f.get("password"));
      if (newPassword !== String(f.get("confirm"))) return setError("The passwords do not match.");
      setPending(true); setError("");
      const { error: err } = await authClient.resetPassword({ newPassword, token });
      setPending(false);
      if (err) return setError("This reset link is invalid or has expired. Request a new one.");
      setDone(true);
    }}>
      {error && <FormMessage>{error}</FormMessage>}
      <Field label="New password" hint="At least 10 characters."><input name="password" type="password" required minLength={10} maxLength={128} autoComplete="new-password" className={inputClass} /></Field>
      <Field label="Confirm new password"><input name="confirm" type="password" required minLength={10} autoComplete="new-password" className={inputClass} /></Field>
      <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "w-full")}>{pending ? "Saving…" : "Set new password"}</button>
    </form>
  );
}

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <button type="button" className={className ?? buttonClass("secondary", "sm")} onClick={async () => {
      await authClient.signOut();
      router.push("/");
      router.refresh();
    }}>Sign out</button>
  );
}

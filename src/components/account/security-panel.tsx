"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { PROVIDER_LABEL, type SocialProvider } from "@/lib/social-providers";
import { buttonClass } from "@/components/ui/button";
import { Field, FormMessage } from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";

export function ChangePasswordForm() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const f = new FormData(form);
      if (f.get("newPassword") !== f.get("confirm")) return setMsg({ ok: false, text: "The new passwords do not match." });
      setPending(true);
      const { error } = await authClient.changePassword({ currentPassword: String(f.get("currentPassword")), newPassword: String(f.get("newPassword")), revokeOtherSessions: true });
      setPending(false);
      setMsg(error ? { ok: false, text: "Current password is incorrect, or the new password is too short (min 10)." } : { ok: true, text: "Password changed. Other sessions were signed out." });
      if (!error) form.reset();
    }}>
      <Field label="Current password"><PasswordInput name="currentPassword" required autoComplete="current-password" /></Field>
      <Field label="New password" hint="At least 10 characters."><PasswordInput name="newPassword" required minLength={10} maxLength={128} autoComplete="new-password" /></Field>
      <Field label="Confirm new password"><PasswordInput name="confirm" required minLength={10} autoComplete="new-password" /></Field>
      {msg && <FormMessage tone={msg.ok ? "success" : "danger"}>{msg.text}</FormMessage>}
      <button type="submit" disabled={pending} className={buttonClass("primary", "md")}>Change password</button>
    </form>
  );
}

export function LinkedAccounts({ providers }: { providers: SocialProvider[] }) {
  const [accounts, setAccounts] = useState<Array<{ providerId: string }>>([]);
  useEffect(() => {
    authClient.listAccounts().then((r) => setAccounts((r.data as Array<{ providerId: string }>) ?? []));
  }, []);
  return (
    <ul className="space-y-2 text-sm">
      {(["credential", ...providers] as const).map((p) => {
        const linked = accounts.some((a) => a.providerId === p);
        const label = p === "credential" ? "Email & password" : PROVIDER_LABEL[p];
        return (
          <li key={p} className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2">
            <span>{label}</span>
            {linked ? <span className="text-success">Connected</span> : p === "credential" ? <span className="text-subtle">Not set</span> : (
              <button type="button" className={buttonClass("secondary", "sm")} onClick={() => authClient.linkSocial({ provider: p, callbackURL: "/account" })}>Connect</button>
            )}
          </li>
        );
      })}
      {providers.length === 0 && <li className="text-xs text-subtle">No other sign-in methods are enabled on this server.</li>}
    </ul>
  );
}

export function SignOutEverywhere() {
  const [done, setDone] = useState(false);
  return done ? <FormMessage tone="success">All other sessions were signed out.</FormMessage> : (
    <button type="button" className={buttonClass("secondary", "sm")} onClick={async () => { await authClient.revokeOtherSessions(); setDone(true); }}>Sign out of all other devices</button>
  );
}

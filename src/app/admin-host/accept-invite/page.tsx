import QRCode from "qrcode";
import { AdminAuthShell } from "@/components/portal/admin-auth-shell";
import { ActionForm } from "@/components/ui/action-form";
import { Field, FormMessage, inputClass } from "@/components/ui/form";
import { findValidInvitation, invitationTotpSecret } from "@/server/admin/invitations";
import { otpauthUri } from "@/server/admin/crypto";
import { ROLE_LABEL } from "@/server/admin/permissions";
import { acceptInviteAction } from "@/server/actions/admin";

export const metadata = { title: "Accept invitation" };

export default async function AcceptInvite({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const inv = token ? await findValidInvitation(token) : null;
  if (!token || !inv) return <AdminAuthShell title="Invitation unavailable"><FormMessage>This invitation link is invalid, already used or expired. Ask a Super Administrator for a new one.</FormMessage></AdminAuthShell>;
  const secret = await invitationTotpSecret(inv.id);
  const uri = otpauthUri(secret, inv.email);
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 200 });
  return (
    <AdminAuthShell title="Set up your administrator account" subtitle={`${inv.email} · ${ROLE_LABEL[inv.role]}`}>
      <ActionForm action={acceptInviteAction.bind(null, token)} submitLabel="Create account">
        <Field label="Your name"><input name="name" required maxLength={80} autoComplete="name" className={inputClass} /></Field>
        <Field label="Password" hint="At least 12 characters. Use a password manager."><input name="password" type="password" required minLength={12} maxLength={200} autoComplete="new-password" className={inputClass} /></Field>
        <Field label="Confirm password"><input name="confirm" type="password" required minLength={12} autoComplete="new-password" className={inputClass} /></Field>
        <div className="space-y-2 rounded-xl bg-surface-2 p-3 text-sm">
          <p className="font-medium">Two-factor authentication (required)</p>
          <p className="text-muted">Scan this code with an authenticator app (e.g. 1Password, Google Authenticator, Aegis), then enter the 6-digit code.</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
          <img src={qr} alt="QR code for your authenticator app" width={200} height={200} className="rounded-lg bg-white p-1" />
          <p className="break-all text-xs">Manual key: <code data-testid="totp-secret">{secret}</code></p>
        </div>
        <Field label="Authenticator code"><input name="totp" required inputMode="numeric" pattern="[0-9 ]{6,7}" maxLength={7} autoComplete="one-time-code" className={inputClass} /></Field>
      </ActionForm>
    </AdminAuthShell>
  );
}

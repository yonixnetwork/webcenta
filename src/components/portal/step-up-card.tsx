import { ActionForm } from "@/components/ui/action-form";
import { Card, Field, inputClass } from "@/components/ui/form";
import { getAdmin } from "@/server/admin/auth";
import { STEP_UP_MINUTES, stepUpFresh } from "@/server/admin/step-up";
import { confirmIdentityAction } from "@/server/actions/admin";

/** "Confirm identity" for sensitive actions on this page (valid STEP_UP_MINUTES on this session). */
export async function StepUpCard() {
  const a = await getAdmin();
  if (!a) return null;
  const fresh = await stepUpFresh(a.sessionId);
  return (
    <Card>
      <h2 className="mb-1 font-semibold">Confirm your identity</h2>
      <p className="mb-3 text-sm text-muted">
        Sensitive actions on this page (administrators, roles, security settings, removals) need a recent confirmation with your authenticator app.{" "}
        {fresh ? <strong className="text-success">Confirmed for this session (valid up to {STEP_UP_MINUTES} minutes after confirming or signing in).</strong> : <strong className="text-warning">Not confirmed in the last {STEP_UP_MINUTES} minutes.</strong>}
      </p>
      {!fresh && (
        <ActionForm action={confirmIdentityAction} submitLabel="Confirm" pendingLabel="Checking…" variant="secondary">
          <Field label="Authenticator code"><input name="stepUpCode" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,8}" required className={`${inputClass} max-w-40 font-mono tracking-widest`} /></Field>
        </ActionForm>
      )}
    </Card>
  );
}

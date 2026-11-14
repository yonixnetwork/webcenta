import { Field, inputClass } from "./form";

/**
 * Shown inside a form when the server asked for confirmation of a sensitive action (step-up):
 * the administrator enters a code from the authenticator app and submits the same form again.
 */
export function StepUpInput({ show }: { show?: boolean }) {
  if (!show) return null;
  return (
    <Field label="Authenticator code" hint="This is a sensitive action. Enter the 6-digit code from your authenticator app to confirm it. The confirmation is valid for 10 minutes on this device.">
      <input name="stepUpCode" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,8}" required className={`${inputClass} max-w-40 font-mono tracking-widest`} />
    </Field>
  );
}

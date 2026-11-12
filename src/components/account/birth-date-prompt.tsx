import { ActionForm } from "@/components/ui/action-form";
import { inputClass } from "@/components/ui/form";
import { birthDateAction } from "@/server/actions/user";

/** Asked once of signed-in users without a date of birth (Google/GitHub sign-ups and older accounts). */
export function BirthDatePrompt() {
  return (
    <section aria-labelledby="dob-title" className="mx-auto mb-2 mt-3 max-w-7xl px-4 sm:px-6">
      <div className="rounded-2xl border border-brand/30 bg-brand-soft/60 p-4">
        <h2 id="dob-title" className="font-semibold">One more step: your date of birth</h2>
        <p className="mb-3 text-sm text-muted">We use it only to show content suitable for your age. It is never shown to anyone and can only be set once.</p>
        <ActionForm action={birthDateAction} submitLabel="Save" hideOnSuccess className="flex flex-wrap items-end gap-3 space-y-0">
          <label className="text-sm font-medium">
            <span className="sr-only">Date of birth</span>
            <input name="birthDate" type="date" required autoComplete="bday" min="1900-01-01" max={new Date().toISOString().slice(0, 10)} className={inputClass} />
          </label>
        </ActionForm>
      </div>
    </section>
  );
}

import type { Metadata } from "next";
import { ActionForm } from "@/components/ui/action-form";
import { Card, Field, inputClass } from "@/components/ui/form";
import { getCurrentUser } from "@/server/auth/session";
import { contactAction } from "@/server/actions/public";

export const metadata: Metadata = { title: "Contact & support", alternates: { canonical: "/contact" } };

export default async function ContactPage() {
  const user = await getCurrentUser();
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-3xl font-extrabold tracking-tight">Contact & support</h1>
      <p className="text-muted">Questions, copyright complaints or account problems. To report a specific app or review, use the Report button on its page.</p>
      <Card>
        <ActionForm action={contactAction} submitLabel="Send message" hideOnSuccess>
          {!user && <Field label="Your email"><input name="email" type="email" required className={inputClass} /></Field>}
          <Field label="Subject"><input name="subject" required minLength={3} maxLength={150} className={inputClass} /></Field>
          <Field label="Message"><textarea name="body" required minLength={10} maxLength={5000} rows={6} className={inputClass} /></Field>
          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
        </ActionForm>
      </Card>
    </div>
  );
}

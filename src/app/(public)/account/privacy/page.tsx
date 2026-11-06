import { ActionForm } from "@/components/ui/action-form";
import { buttonClass } from "@/components/ui/button";
import { Card, Field, inputClass } from "@/components/ui/form";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { getCategoryTree } from "@/server/catalog/categories";
import { adultContentAction, clearHistoryAction, deleteAccountAction, resetInterestsAction, setInterestsAction, updatePrivacyAction } from "@/server/actions/user";

export default async function PrivacyPage() {
  const user = await requireUser("/account/privacy");
  const [tree, interests] = await Promise.all([getCategoryTree(), db.userInterest.findMany({ where: { userId: user.id }, include: { category: { select: { name: true } } } })]);
  const explicit = new Set(interests.filter((i) => i.source === "EXPLICIT").map((i) => i.categoryId));
  const inferred = interests.filter((i) => i.source === "INFERRED").sort((a, b) => b.weight - a.weight).slice(0, 8);
  const check = "size-4 accent-[var(--brand)]";
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Privacy & data</h1>
      <Card>
        <h2 className="mb-3 font-semibold">Personalisation and history</h2>
        <ActionForm action={updatePrivacyAction} submitLabel="Save settings">
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="personalizationEnabled" defaultChecked={user.personalizationEnabled} className={check} />
            <span><strong>Personalised recommendations</strong><br /><span className="text-muted">Use my activity on WebCenter to recommend apps. Developers never see your activity.</span></span></label>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="historyEnabled" defaultChecked={user.historyEnabled} className={check} />
            <span><strong>Keep browsing history</strong><br /><span className="text-muted">Turning this off also deletes the existing history.</span></span></label>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="emailNotifications" defaultChecked={user.emailNotifications} className={check} />
            <span><strong>Email notifications</strong><br /><span className="text-muted">Developer replies and updates about your reports or listings.</span></span></label>
        </ActionForm>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
          <form action={clearHistoryAction}><button className={buttonClass("secondary", "sm")}>Clear browsing history</button></form>
          <form action={resetInterestsAction}><button className={buttonClass("secondary", "sm")}>Reset interests</button></form>
        </div>
        {inferred.length > 0 && <p className="mt-3 text-xs text-muted">Inferred from your activity: {inferred.map((i) => i.category.name).join(", ")}.</p>}
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">Your interests</h2>
        <ActionForm action={setInterestsAction} submitLabel="Save interests">
          <fieldset className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <legend className="sr-only">Interests</legend>
            {tree.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="interest" value={c.id} defaultChecked={explicit.has(c.id)} className={check} />{c.name}</label>
            ))}
          </fieldset>
        </ActionForm>
      </Card>
      <Card>
        <h2 className="mb-1 font-semibold">Mature content</h2>
        <p className="mb-3 text-sm text-muted">Currently showing apps rated up to <strong>{user.maxAgeRating === "AGE_18_PLUS" && user.adultConfirmedAt ? "18+" : "16+"}</strong>. This is a self-declaration, not age verification. Some regulated categories remain unavailable regardless of this setting.</p>
        {user.adultConfirmedAt ? (
          <ActionForm action={adultContentAction} submitLabel="Hide 18+ apps" variant="secondary"><input type="hidden" name="enable" value="0" /></ActionForm>
        ) : (
          <ActionForm action={adultContentAction} submitLabel="Show 18+ apps" variant="secondary">
            <input type="hidden" name="enable" value="1" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirm" className={check} /> I confirm I am at least 18 years old.</label>
          </ActionForm>
        )}
      </Card>
      <Card>
        <h2 className="mb-1 font-semibold">Your data</h2>
        <p className="mb-3 text-sm text-muted">Download a copy of the data WebCenter holds about your account.</p>
        <a href="/account-export" className={buttonClass("secondary", "sm")} download>Download my data (JSON)</a>
      </Card>
      <Card className="border-danger/30">
        <h2 className="mb-1 font-semibold text-danger">Delete account</h2>
        <p className="mb-3 text-sm text-muted">You will be signed out immediately. Your account, favourites, collections and reviews are permanently deleted after 30 days.</p>
        <ActionForm action={deleteAccountAction} submitLabel="Delete my account" variant="secondary">
          <Field label={`Type ${user.email} to confirm`}><input name="confirmEmail" autoComplete="off" className={inputClass} /></Field>
        </ActionForm>
      </Card>
    </>
  );
}

import { ActionForm } from "@/components/ui/action-form";
import { Card, Field, inputClass } from "@/components/ui/form";
import { DataTable, td } from "@/components/portal/table";
import { requireAdmin } from "@/server/admin/auth";
import { db } from "@/server/db";
import { networkSettings } from "@/server/viewer";
import { deleteCountryPolicyAction, saveCountryPolicyAction } from "@/server/actions/international";
import { countryName } from "@/i18n/format";
import { formatDate } from "@/lib/labels";

export const metadata = { title: "Country policies" };

const list = (v: unknown) => (Array.isArray(v) ? (v as string[]).join(", ") : "");

/**
 * Admin → Country policies: categories hidden per country, minimum age for adult content, and
 * advertising switched off (entirely or per provider). Rules only add restrictions; a user's
 * own country choice never removes one that applies where they are.
 */
export default async function CountriesAdmin({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireAdmin("settings.manage");
  const sp = await searchParams;
  const [rows, net] = await Promise.all([db.countryPolicy.findMany({ orderBy: { country: "asc" } }), networkSettings()]);
  const editing = rows.find((r) => r.country === (sp.edit ?? "").toUpperCase());
  return (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight">Country policies</h1>
      <Card>
        <p className="text-sm text-muted">
          The visitor&apos;s country comes from the <code>{net.geoCountryHeader}</code> request header set by the CDN or proxy in front of Webcenta
          (Settings → Security). Only the two-letter country code is used; the IP address is not stored for this. When no trusted header is present the
          country is <strong>unknown</strong> and is never guessed: listings restricted to certain countries follow the &ldquo;unknown country&rdquo; setting, and ads
          follow Settings → Ad content policy. A country a user chooses in their settings adds that country&apos;s restrictions; it never removes the
          detected country&apos;s. VPNs and proxies can hide a visitor&apos;s real country.
        </p>
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">{editing ? `Edit ${editing.country} — ${countryName("en", editing.country)}` : "Add or update a country"}</h2>
        <ActionForm action={saveCountryPolicyAction} submitLabel="Save policy">
          <Field label="Country code" hint="ISO 3166-1 alpha-2, e.g. DE, KR, US."><input name="country" required maxLength={2} defaultValue={editing?.country ?? ""} className={`${inputClass} uppercase`} /></Field>
          <Field label="Restricted categories" hint="Category slugs hidden in this country (their sub-categories too), separated by commas, e.g. betting-gambling, cryptocurrency."><input name="restrictedCategories" defaultValue={list(editing?.restrictedCategories)} className={inputClass} /></Field>
          <Field label="Permitted categories (notes)" hint="Regulated categories you have confirmed are lawful here. For the record only: it never lifts a global restriction."><input name="permittedCategories" defaultValue={list(editing?.permittedCategories)} className={inputClass} /></Field>
          <Field label="Minimum age for adult (18+) content" hint="18–25. Empty: the built-in age-of-majority table."><input name="adultAge" type="number" min={18} max={25} defaultValue={editing?.adultAge ?? ""} className={inputClass} /></Field>
          <fieldset className="space-y-1 text-sm">
            <legend className="mb-1 font-medium">Advertising</legend>
            <label className="flex items-center gap-2"><input type="checkbox" name="adsDisabled" defaultChecked={editing?.adsDisabled} className="size-4" />No ads at all for visitors from this country</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="disable_adsense" defaultChecked={Array.isArray(editing?.disabledProviders) && (editing.disabledProviders as string[]).includes("adsense")} className="size-4" />Do not use Google AdSense here</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="disable_adsterra" defaultChecked={Array.isArray(editing?.disabledProviders) && (editing.disabledProviders as string[]).includes("adsterra")} className="size-4" />Do not use Adsterra here</label>
          </fieldset>
          <Field label="Notes" hint="Legal basis, sources, who reviewed it."><textarea name="notes" rows={3} maxLength={2000} defaultValue={editing?.notes ?? ""} className={inputClass} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="reviewed" className="size-4" />I reviewed this policy today (sets &ldquo;last reviewed&rdquo;)</label>
        </ActionForm>
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">Policies ({rows.length})</h2>
        <DataTable head={["Country", "Restricted", "Permitted", "Adult age", "Ads", "Last reviewed", "Notes", ""]} empty={!rows.length}>
          {rows.map((r) => (
            <tr key={r.country} className="border-t border-border" data-testid={`country-${r.country}`}>
              <td className={td}><strong>{r.country}</strong><br /><span className="text-xs text-subtle">{countryName("en", r.country)}</span></td>
              <td className={`${td} text-xs`}>{list(r.restrictedCategories) || "—"}</td>
              <td className={`${td} text-xs`}>{list(r.permittedCategories) || "—"}</td>
              <td className={td}>{r.adultAge ?? "default"}</td>
              <td className={`${td} text-xs`}>{r.adsDisabled ? "Off" : list(r.disabledProviders) ? `Not ${list(r.disabledProviders)}` : "Allowed"}</td>
              <td className={`${td} text-xs`}>{r.lastReviewedAt ? formatDate(r.lastReviewedAt) : <span className="text-warning">Never</span>}</td>
              <td className={`${td} max-w-xs text-xs`}>{r.notes ?? ""}</td>
              <td className={td}>
                <a href={`/countries?edit=${r.country}`} className="text-sm text-brand underline">Edit</a>
                <ActionForm action={deleteCountryPolicyAction.bind(null, r.country)} submitLabel="Remove" variant="ghost" className="mt-1"><span className="sr-only">Remove {r.country}</span></ActionForm>
              </td>
            </tr>
          ))}
        </DataTable>
      </Card>
    </>
  );
}

import type { Metadata } from "next";
import { ActionForm } from "@/components/ui/action-form";
import { Card, Field, inputClass } from "@/components/ui/form";
import { adReportAction } from "@/server/actions/public";
import { AD_REPORT_REASONS } from "@/lib/ad-report";

export const metadata: Metadata = { title: "Report an ad", robots: { index: false, follow: false } };

const clean = (v: string | undefined, re: RegExp, fallback: string) => (v && re.test(v) ? v : fallback);

/** "Report this ad", linked from every ad label. */
export default async function ReportAdPage({ searchParams }: { searchParams: Promise<{ placement?: string; provider?: string; from?: string }> }) {
  const sp = await searchParams;
  const placement = clean(sp.placement, /^[a-z0-9-]{2,40}$/, "unknown");
  const provider = clean(sp.provider, /^(adsense|adsterra)$/, "unknown");
  const from = clean(sp.from, /^\/[^\s]{0,299}$/, "/");
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Report an ad</h1>
      <p className="text-muted">
        Ads are chosen and served by our advertising partners, not by Webcenta, and we cannot see each ad in advance.
        Tell us what was wrong: we review every report, block the advertiser with the provider where their tools allow it,
        and can switch off the placement or the provider.
      </p>
      <Card>
        <ActionForm action={adReportAction} submitLabel="Send report" hideOnSuccess>
          <input type="hidden" name="placement" value={placement} />
          <input type="hidden" name="provider" value={provider} />
          <input type="hidden" name="from" value={from} />
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-semibold">What was wrong?</legend>
            {AD_REPORT_REASONS.map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm"><input type="radio" name="reason" value={value} required className="size-4 accent-[var(--brand)]" />{label}</label>
            ))}
          </fieldset>
          <Field label="Details (optional)" hint="What the ad showed or where it led. Please don’t include personal information.">
            <textarea name="details" maxLength={1000} rows={4} className={inputClass} />
          </Field>
          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
        </ActionForm>
      </Card>
      <p className="text-xs text-subtle">Page: {from} · placement: {placement}</p>
    </div>
  );
}

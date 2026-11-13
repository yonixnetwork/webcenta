import { ActionForm, type FormState } from "@/components/ui/action-form";
import { Field, inputClass } from "@/components/ui/form";
import { MediaUploader } from "./media-uploader";
import { AGE_LABEL, PLATFORM_LABEL, PRICING_LABEL } from "@/lib/labels";
import { LISTING_PRICING, PLATFORMS } from "@/lib/search-params";
import type { CategoryNode } from "@/server/catalog/categories";
import type { ListingInput } from "@/server/listings/input";

type Upload = (form: FormData) => Promise<{ ok: true; id: string; url: string } | { ok: false; message: string }>;

function CategorySelect({ name, tree, value, required, allowEmpty }: { name: string; tree: CategoryNode[]; value?: string; required?: boolean; allowEmpty?: boolean }) {
  return (
    <select name={name} defaultValue={value ?? ""} required={required} className={inputClass}>
      <option value="" disabled={!allowEmpty}>{allowEmpty ? "— none —" : "Choose a category"}</option>
      {tree.map((p) => (
        <optgroup key={p.id} label={p.name}>
          <option value={p.id}>{p.name} (general)</option>
          {p.children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

/** Full listing form shared by the developer portal and the admin portal. */
export function ListingEditor({ action, upload, tree, initial, media, submitLabel, extra }: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  upload: Upload;
  tree: CategoryNode[];
  initial?: Partial<ListingInput>;
  media: { logo: Array<{ id: string; url: string }>; screenshots: Array<{ id: string; url: string }> };
  submitLabel: string;
  extra?: React.ReactNode;
}) {
  const i = initial ?? {};
  const extraCats = i.categoryIds?.filter((c) => c !== i.primaryCategoryId) ?? [];
  const check = "size-4 accent-[var(--brand)]";
  return (
    <ActionForm action={action} submitLabel={submitLabel} className="space-y-6">
      {extra}
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-lg font-bold">Basics</legend>
        <Field label="App name"><input name="name" required minLength={2} maxLength={80} defaultValue={i.name} className={inputClass} /></Field>
        <Field label="Tagline" hint="One short sentence (max 140)."><input name="tagline" maxLength={140} defaultValue={i.tagline} className={inputClass} /></Field>
        <Field label="Official website (https://)" className="sm:col-span-2"><input name="websiteUrl" type="url" required placeholder="https://example.com" defaultValue={i.websiteUrl} className={inputClass} /></Field>
        <Field label="Description" className="sm:col-span-2" hint="At least 30 characters. Describe what the app does, honestly."><textarea name="description" required minLength={30} maxLength={5000} rows={6} defaultValue={i.description} className={inputClass} /></Field>
        <Field label="Key features" className="sm:col-span-2" hint="One per line (max 12)."><textarea name="features" rows={4} defaultValue={i.features?.join("\n")} className={inputClass} /></Field>
        <Field label="Publisher (who makes the app)"><input name="publisherName" required minLength={2} maxLength={120} defaultValue={i.publisherName} className={inputClass} /></Field>
        <Field label="Publisher website (optional)"><input name="publisherUrl" type="url" defaultValue={i.publisherUrl} className={inputClass} /></Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-lg font-bold">Classification</legend>
        <Field label="Primary category"><CategorySelect name="primaryCategoryId" tree={tree} value={i.primaryCategoryId} required /></Field>
        <Field label="Additional category (optional)"><CategorySelect name="categoryIds" tree={tree} value={extraCats[0]} allowEmpty /></Field>
        <Field label="Additional category (optional)"><CategorySelect name="categoryIds" tree={tree} value={extraCats[1]} allowEmpty /></Field>
        <Field label="Tags" hint="Comma-separated, max 10."><input name="tags" defaultValue={i.tags?.join(", ")} className={inputClass} /></Field>
        <Field label="Age rating">
          <select name="ageRating" defaultValue={i.ageRating ?? "ALL_AGES"} className={inputClass}>
            {(["ALL_AGES", "AGE_13_PLUS", "AGE_16_PLUS", "AGE_18_PLUS"] as const).map((a) => <option key={a} value={a}>{AGE_LABEL[a]}</option>)}
          </select>
        </Field>
        <Field label="Languages" hint="ISO codes, comma-separated (e.g. en, fr)."><input name="languages" defaultValue={i.languages?.join(", ") ?? "en"} className={inputClass} /></Field>
        <Field label="Supported countries" hint="ISO codes, comma-separated. Leave empty for worldwide." className="sm:col-span-2"><input name="supportedCountries" defaultValue={i.supportedCountries?.join(", ")} className={inputClass} /></Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-lg font-bold">Pricing & platforms</legend>
        <Field label="Pricing model">
          <select name="pricingModel" defaultValue={i.pricingModel ?? "FREE"} className={inputClass}>{LISTING_PRICING.map((p) => <option key={p} value={p}>{p === "UNKNOWN" ? "Not stated" : PRICING_LABEL[p]}</option>)}</select>
        </Field>
        <Field label="Pricing details (optional)"><input name="pricingDetails" maxLength={200} defaultValue={i.pricingDetails} placeholder="e.g. Free plan; Pro from $8/month" className={inputClass} /></Field>
        <div className="space-y-2 sm:col-span-2">
          <p className="text-sm font-medium">Platforms</p>
          <div className="flex flex-wrap gap-4">{PLATFORMS.map((p) => (
            <label key={p} className="flex items-center gap-2 text-sm"><input type="checkbox" name="platforms" value={p} defaultChecked={(i.platforms ?? ["WEB"]).includes(p)} className={check} />{PLATFORM_LABEL[p]}</label>
          ))}</div>
        </div>
        <div className="flex flex-wrap gap-4 sm:col-span-2">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isBrowserBased" defaultChecked={i.isBrowserBased ?? true} className={check} />Works in the browser</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isMobileFriendly" defaultChecked={i.isMobileFriendly} className={check} />Mobile-friendly</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isPwaInstallable" defaultChecked={i.isPwaInstallable} className={check} />Installable PWA</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isOpenSource" defaultChecked={i.isOpenSource} className={check} />Open source</label>
        </div>
        <Field label="Source code URL (if open source)"><input name="sourceCodeUrl" type="url" defaultValue={i.sourceCodeUrl} className={inputClass} /></Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-lg font-bold">Policies</legend>
        <Field label="Privacy policy URL"><input name="privacyPolicyUrl" type="url" defaultValue={i.privacyPolicyUrl} className={inputClass} /></Field>
        <Field label="Terms URL"><input name="termsUrl" type="url" defaultValue={i.termsUrl} className={inputClass} /></Field>
        <Field label="Support URL"><input name="supportUrl" type="url" defaultValue={i.supportUrl} className={inputClass} /></Field>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="mb-2 text-lg font-bold">Media</legend>
        <MediaUploader name="logoAssetId" kind="LOGO" upload={upload} initial={media.logo} label="Logo" />
        <MediaUploader name="screenshotAssetIds" kind="SCREENSHOT" upload={upload} initial={media.screenshots} multiple label="Screenshots" />
      </fieldset>
    </ActionForm>
  );
}

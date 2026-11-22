"use server";

import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { assertAdmin } from "@/server/admin/auth";
import { requireStepUp } from "@/server/admin/step-up";
import { invalidateCountryRules } from "@/server/geo/country-policy";
import { invalidateCategoryCache } from "@/server/catalog/categories";
import { LOCALES, normalizeLocale } from "@/i18n/locales";
import { validateKeywords } from "@/i18n/seo-rules";

export interface ActionState { ok: boolean; message: string; stepUp?: boolean }
const ok = (message: string): ActionState => ({ ok: true, message });
const fail = (message: string): ActionState => ({ ok: false, message });
function err(e: unknown): ActionState {
  if (e instanceof ZodError) return fail(e.issues.map((i) => `${i.path.join(".") || "form"}: ${i.message}`).slice(0, 4).join(" · "));
  if (e instanceof Error && e.name === "StepUpError") return { ok: false, message: e.message, stepUp: true };
  if (e instanceof Error && e.message === "FORBIDDEN") return fail("You do not have permission for this action.");
  if (e instanceof Error && e.message === "UNAUTHENTICATED") return fail("Your session expired. Sign in again.");
  if (e instanceof Error && e.name === "PolicyError") return fail(e.message);
  console.error(e);
  return fail("The action failed. Please try again.");
}
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
class PolicyError extends Error { name = "PolicyError"; }

const COUNTRY = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "a two-letter ISO country code");
const PROVIDERS = ["adsense", "adsterra"] as const;

async function slugList(value: string): Promise<string[]> {
  const slugs = [...new Set(value.split(/[\s,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))].slice(0, 200);
  if (!slugs.length) return [];
  const found = new Set((await db.category.findMany({ where: { slug: { in: slugs } }, select: { slug: true } })).map((c) => c.slug));
  const missing = slugs.filter((s) => !found.has(s));
  if (missing.length) throw new PolicyError(`Unknown category slug${missing.length > 1 ? "s" : ""}: ${missing.slice(0, 5).join(", ")}.`);
  return slugs;
}

/** Creates or updates one country's policy (Admin → Country policies). */
export async function saveCountryPolicyAction(_s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("settings.manage");
    const country = COUNTRY.parse(f.get("country"));
    const restricted = await slugList(str(f, "restrictedCategories"));
    const permitted = await slugList(str(f, "permittedCategories"));
    const both = restricted.filter((s) => permitted.includes(s));
    if (both.length) return fail(`A category cannot be both restricted and permitted: ${both.join(", ")}.`);
    const ageRaw = str(f, "adultAge");
    const adultAge = ageRaw ? z.coerce.number().int().min(18).max(25).parse(ageRaw) : null;
    const disabledProviders = PROVIDERS.filter((p) => f.get(`disable_${p}`) === "on");
    const data = {
      restrictedCategories: restricted,
      permittedCategories: permitted,
      adultAge,
      adsDisabled: f.get("adsDisabled") === "on",
      disabledProviders,
      notes: str(f, "notes").slice(0, 2000) || null,
      updatedById: a.id,
      ...(f.get("reviewed") === "on" ? { lastReviewedAt: new Date() } : {}),
    };
    await db.countryPolicy.upsert({ where: { country }, create: { country, ...data }, update: data });
    await audit({ actorType: "ADMIN", adminId: a.id, action: "country-policy.save", targetType: "CountryPolicy", targetId: country, metadata: { restricted, permitted, adultAge, adsDisabled: data.adsDisabled, disabledProviders } });
    invalidateCountryRules();
    invalidateCategoryCache();
    revalidatePath("/", "layout");
    return ok(`Policy for ${country} saved.`);
  } catch (e) { return err(e); }
}

/** Removing a policy lifts restrictions, so it needs a fresh authenticator code. */
export async function deleteCountryPolicyAction(country: string, _s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("settings.manage");
    const cc = COUNTRY.parse(country);
    await requireStepUp(a, str(f, "stepUpCode"), "country-policy.delete");
    await db.countryPolicy.delete({ where: { country: cc } }).catch(() => undefined);
    await audit({ actorType: "ADMIN", adminId: a.id, action: "country-policy.delete", targetType: "CountryPolicy", targetId: cc });
    invalidateCountryRules();
    invalidateCategoryCache();
    revalidatePath("/", "layout");
    return ok(`Policy for ${cc} removed.`);
  } catch (e) { return err(e); }
}

/** Closes an ad report with what was done (blocked with the provider, placement switched off, no action). */
export async function resolveAdReportAction(id: string, _s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("monetization.manage");
    const status = z.enum(["resolved", "dismissed"]).parse(f.get("status"));
    const resolution = z.string().trim().min(3).max(500).parse(f.get("resolution"));
    await db.adReport.update({ where: { id }, data: { status, resolution, resolvedById: a.id, resolvedAt: new Date() } });
    await audit({ actorType: "ADMIN", adminId: a.id, action: `ad-report.${status}`, targetType: "AdReport", targetId: id, metadata: { resolution } });
    revalidatePath("/ad-reports");
    return ok(status === "resolved" ? "Report resolved." : "Report dismissed.");
  } catch (e) { return err(e); }
}

/** Homepage title, description and keywords for one language. */
export async function saveLocaleSeoAction(_s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("settings.manage");
    const locale = normalizeLocale(str(f, "locale"));
    if (!locale) return fail("Unknown language.");
    const title = z.string().trim().max(70, "at most 70 characters").parse(str(f, "title")) || null;
    const description = z.string().trim().max(170, "at most 170 characters").parse(str(f, "description")) || null;
    const { keywords, problems } = validateKeywords(str(f, "keywords"));
    if (problems.length) return fail(problems.join(" "));
    await db.localeSeo.upsert({ where: { locale }, create: { locale, title, description, keywords, updatedById: a.id }, update: { title, description, keywords, updatedById: a.id } });
    await audit({ actorType: "ADMIN", adminId: a.id, action: "seo.locale.save", targetType: "LocaleSeo", targetId: locale, metadata: { title, keywords: keywords.length } });
    revalidatePath("/", "layout");
    return ok(`Search metadata for ${LOCALES.find((l) => l.code === locale)?.english ?? locale} saved.`);
  } catch (e) { return err(e); }
}

/** A category's name and description in one language (overrides the bundled catalogue). */
export async function saveCategoryTranslationAction(_s: ActionState, f: FormData): Promise<ActionState> {
  try {
    const a = await assertAdmin("catalog.manage");
    const locale = normalizeLocale(str(f, "locale"));
    if (!locale || locale === "en") return fail("Choose a language other than English (English names are edited in Categories).");
    const categoryId = z.string().min(1).max(64).parse(str(f, "categoryId"));
    if (!(await db.category.findUnique({ where: { id: categoryId }, select: { id: true } }))) return fail("Unknown category.");
    const name = z.string().trim().max(120).parse(str(f, "name"));
    const description = z.string().trim().max(500).parse(str(f, "description")) || null;
    if (!name) {
      await db.categoryTranslation.deleteMany({ where: { categoryId, locale } });
    } else {
      const data = { name, description, reviewed: f.get("reviewed") === "on", updatedById: a.id };
      await db.categoryTranslation.upsert({ where: { categoryId_locale: { categoryId, locale } }, create: { categoryId, locale, ...data }, update: data });
    }
    await audit({ actorType: "ADMIN", adminId: a.id, action: "category.translate", targetType: "Category", targetId: categoryId, metadata: { locale, removed: !name } });
    invalidateCategoryCache();
    revalidatePath("/", "layout");
    return ok(name ? "Translation saved." : "Translation removed (the bundled or English name is used).");
  } catch (e) { return err(e); }
}

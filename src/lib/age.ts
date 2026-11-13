import type { AgeRating } from "@/generated/prisma/enums";

/** Youngest age at which someone may create a Webcenta account (COPPA / GDPR-K baseline). */
export const MIN_SIGNUP_AGE = 13;

/**
 * Age of majority where it is not 18 (adult content and other 18+ categories follow it).
 * Everywhere else: 18. Self-declared date of birth; this is not identity verification.
 */
const MAJORITY: Record<string, number> = { KR: 19, DZ: 19, TW: 18, JP: 18, TH: 20, BH: 21, KW: 21, AE: 21, SG: 21, MY: 18, NZ: 18 };

export function majorityAge(country: string | null | undefined): number {
  return (country && MAJORITY[country.toUpperCase()]) || 18;
}

/** Whole years between a date of birth and `now` (UTC calendar dates). */
export function ageOn(birthDate: Date, now = new Date()): number {
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const m = now.getUTCMonth() - birthDate.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birthDate.getUTCDate())) age--;
  return age;
}

/** The highest content rating a person of this age may see. */
export function ratingForAge(age: number, country?: string | null): AgeRating {
  if (age >= majorityAge(country)) return "AGE_18_PLUS";
  if (age >= 16) return "AGE_16_PLUS";
  if (age >= 13) return "AGE_13_PLUS";
  return "ALL_AGES";
}

/** Parses an ISO date of birth (YYYY-MM-DD) that is a real, plausible date. */
export function parseBirthDate(value: unknown, now = new Date()): Date | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const d = value instanceof Date ? value : /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  const age = ageOn(d, now);
  return age >= 0 && age <= 120 ? d : null;
}

/** The lower of two ratings. */
export function minRating(a: AgeRating, b: AgeRating): AgeRating {
  const order: AgeRating[] = ["ALL_AGES", "AGE_13_PLUS", "AGE_16_PLUS", "AGE_18_PLUS"];
  return order[Math.min(order.indexOf(a), order.indexOf(b))]!;
}

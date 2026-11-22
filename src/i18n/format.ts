/** Locale-aware formatting (Intl), with a safe English fallback for engines missing a locale. */
const safe = <T,>(fn: () => T, fallback: () => T): T => { try { return fn(); } catch { return fallback(); } };

export function formatDateIn(locale: string, d: Date | string | null | undefined, style: "medium" | "long" = "medium"): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return safe(() => new Intl.DateTimeFormat(locale, { dateStyle: style, timeZone: "UTC" }).format(date), () => date.toISOString().slice(0, 10));
}

export function formatNumberIn(locale: string, n: number, opts?: Intl.NumberFormatOptions): string {
  return safe(() => new Intl.NumberFormat(locale, opts).format(n), () => String(n));
}

export function formatCurrencyIn(locale: string, amount: number, currency: string): string {
  return safe(() => new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount), () => `${amount} ${currency}`);
}

/** Sorting that follows the language's alphabet (e.g. Swedish å/ä/ö, Spanish ñ). */
export function collatorFor(locale: string): Intl.Collator {
  return safe(() => new Intl.Collator(locale, { sensitivity: "base", numeric: true }), () => new Intl.Collator("en"));
}

/** Country name in the visitor's language ("DE" → "Alemania" in Spanish). */
export function countryName(locale: string, code: string): string {
  return safe(() => new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code, () => code);
}

/** Default currency of common countries, for regional display only (prices themselves are never converted). */
const CURRENCY: Record<string, string> = {
  US: "USD", GB: "GBP", CA: "CAD", AU: "AUD", NZ: "NZD", IN: "INR", JP: "JPY", CN: "CNY", KR: "KRW", BR: "BRL", MX: "MXN",
  AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN", ZA: "ZAR", NG: "NGN", KE: "KES", EG: "EGP", SA: "SAR", AE: "AED", IL: "ILS",
  TR: "TRY", RU: "RUB", UA: "UAH", PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON", BG: "BGN", SE: "SEK", NO: "NOK", DK: "DKK",
  CH: "CHF", ID: "IDR", MY: "MYR", SG: "SGD", TH: "THB", VN: "VND", PH: "PHP", PK: "PKR", BD: "BDT", IR: "IRR", TW: "TWD", HK: "HKD",
};
const EURO = new Set(["AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES"]);
export function currencyForCountry(country: string | null | undefined): string | null {
  if (!country) return null;
  return EURO.has(country) ? "EUR" : CURRENCY[country] ?? null;
}

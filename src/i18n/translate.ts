/**
 * Message lookup shared by server and client code (no Node APIs).
 *
 * A catalogue is a flat object of keys. A value is either a string with {placeholders} or a
 * plural object ({ zero?, one, two?, few?, many?, other }) chosen with Intl.PluralRules.
 * Values are plain text: they are rendered by React (escaped), never as HTML.
 */
export type MessageValue = string | Partial<Record<Intl.LDMLPluralRule, string>>;
export type Catalog = Record<string, MessageValue>;
export type Vars = Record<string, string | number>;
export type T = (key: string, vars?: Vars) => string;

const pluralCache = new Map<string, Intl.PluralRules>();
function pluralRule(locale: string, n: number): Intl.LDMLPluralRule {
  let r = pluralCache.get(locale);
  if (!r) { try { r = new Intl.PluralRules(locale); } catch { r = new Intl.PluralRules("en"); } pluralCache.set(locale, r); }
  return r.select(n);
}

function pick(value: MessageValue | undefined, locale: string, vars?: Vars): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  const count = Number(vars?.count ?? 0);
  // "zero" is used for 0 in every language when present (a friendlier "No results").
  if (count === 0 && value.zero) return value.zero;
  return value[pluralRule(locale, count)] ?? value.other;
}

export function interpolate(text: string, vars?: Vars, locale = "en"): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => {
    const v = vars[name];
    if (v === undefined) return m;
    return typeof v === "number" ? formatNumberSafe(v, locale) : v;
  });
}

function formatNumberSafe(n: number, locale: string) {
  try { return new Intl.NumberFormat(locale).format(n); } catch { return String(n); }
}

/** A translate function for one namespace: the locale's catalogue, then English, then the key. */
export function createT(locale: string, messages: Catalog, fallback: Catalog): T {
  return (key, vars) => {
    const own = pick(messages[key], locale, vars);
    if (own !== undefined) return interpolate(own, vars, locale);
    const en = pick(fallback[key], "en", vars);
    return en === undefined ? key : interpolate(en, vars, "en");
  };
}

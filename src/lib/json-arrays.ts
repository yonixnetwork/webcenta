/**
 * MySQL / MariaDB have no array columns, so list fields (features, platforms,
 * supportedCountries, languages, resolvedIps, nameservers) are stored as JSON
 * arrays. These helpers read them back defensively: anything that is not an
 * array of strings becomes an empty list instead of crashing a page.
 */
export function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** Like stringArray, but keeps only values in `allowed` (e.g. enum members). */
export function enumArray<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  const set = new Set<string>(allowed);
  return stringArray(value).filter((v): v is T => set.has(v));
}

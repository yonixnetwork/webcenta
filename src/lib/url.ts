/** URL helpers shared by server code. Pure functions — unit tested. */

/** Parses and normalises an official website URL. Only https is accepted. */
export function normalizeWebsiteUrl(input: string): URL | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "443") return null;
  if (!url.hostname.includes(".")) return null;
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  return url;
}

/** Host without a leading "www.", lower-case. */
export function displayDomain(input: string): string {
  try {
    return new URL(input).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Accepts only same-site relative paths ("/x"), rejecting "//evil" and "/\\evil". */
export function isSafeRelativePath(path: string): boolean {
  return /^\/(?![/\\])/.test(path) && !/[\r\n]/.test(path);
}

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && slug.length <= 80;
}

import { readFileSync } from "node:fs";
import path from "node:path";

let cached: string | null = null;

/**
 * The id Next.js gave this production build (.next/BUILD_ID, written once per build and shipped
 * with the standalone server). Every page and /api/version report the same value, so a visitor is
 * offered an update only when a genuinely newer deployment is running. "dev" outside a build.
 */
export function buildId(): string {
  if (cached) return cached;
  try {
    cached = readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim() || "dev";
  } catch {
    cached = "dev";
  }
  return cached;
}

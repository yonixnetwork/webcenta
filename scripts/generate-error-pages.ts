/**
 * Writes public/errors/{404,500,502,503}.html from src/lib/static-error-pages.ts.
 * Run after changing the copy: `npm run errors:generate`. A unit test fails if
 * the committed files are out of date.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { staticErrorPage, type StaticErrorCode } from "../src/lib/static-error-pages";

const dir = join(process.cwd(), "public", "errors");
mkdirSync(dir, { recursive: true });
for (const code of ["404", "500", "502", "503"] as StaticErrorCode[]) {
  writeFileSync(join(dir, `${code}.html`), staticErrorPage(code));
  console.log(`public/errors/${code}.html`);
}

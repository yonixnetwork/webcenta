/**
 * Serialises environment variables for a .env file that Next.js loads at
 * startup (@next/env: dotenv + dotenv-expand). Values are taken literally:
 * $ is escaped (dotenv-expand would interpolate it), the quote character is
 * one the value does not contain, and newlines use the double-quoted \\n form.
 */
export function snapshotLines(env, names) {
  const lines = [];
  for (const name of names) {
    const value = env[name];
    if (value === undefined || value === "") continue;
    // Next.js expands $VAR in .env files: \$ keeps a literal dollar sign.
    let v = value.replace(/\$/g, "\\$");
    let q;
    if (/\r?\n/.test(v)) {
      // Only double quotes turn \n back into newlines (e.g. a PEM key).
      if (v.includes('"')) { console.warn(`prepare-standalone: skipped ${name} (multi-line value with a double quote)`); continue; }
      v = v.replace(/\r?\n/g, "\\n");
      q = '"';
    } else {
      q = ["'", "`", '"'].find((c) => !v.includes(c));
      if (!q) { console.warn(`prepare-standalone: skipped ${name} (contains every quote character)`); continue; }
    }
    lines.push(`${name}=${q}${v}${q}`);
  }
  return lines;
}


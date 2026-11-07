/**
 * Trigram similarity, compatible with PostgreSQL's pg_trgm (which Webcenta used
 * before moving to MySQL/MariaDB): text is lower-cased, split into words of
 * letters/digits, each word is padded as "  word " and cut into 3-character
 * pieces. similarity = |A ∩ B| / |A ∪ B|.
 *
 * MySQL has no trigram index, so trigrams are also encoded as FULLTEXT-friendly
 * tokens ("t" + hex of the UTF-8 bytes): alphanumeric, never a stopword, at
 * least 3 characters long. A FULLTEXT search on those tokens finds candidates;
 * the exact similarity is then computed here.
 */
export function trigramsOf(text: string): Set<string> {
  const out = new Set<string>();
  for (const word of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    const chars = Array.from(`  ${word} `);
    for (let i = 0; i + 3 <= chars.length; i++) out.add(chars.slice(i, i + 3).join(""));
  }
  return out;
}

export function similarity(a: string, b: string): number {
  const ta = trigramsOf(a);
  const tb = trigramsOf(b);
  if (ta.size === 0 && tb.size === 0) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return common / (ta.size + tb.size - common);
}

export function trigramToken(trigram: string): string {
  return `t${Buffer.from(trigram, "utf8").toString("hex")}`;
}

/** Space-separated trigram tokens for a FULLTEXT column or query (bounded size). */
export function trigramTokens(text: string, max = 400): string {
  return Array.from(trigramsOf(text)).slice(0, max).map(trigramToken).join(" ");
}

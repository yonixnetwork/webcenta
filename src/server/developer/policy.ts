import { getSection } from "@/server/settings/store";

export type VerificationMethod = "DNS_TXT" | "HTML_META" | "WELL_KNOWN_FILE";

/** Admin → Settings → Developer portal. */
export async function developerPolicy(): Promise<{ allowNewOrganizations: boolean; maxDraftsPerOrg: number; methods: VerificationMethod[] }> {
  const c = await getSection("developer");
  const methods: VerificationMethod[] = [];
  if (c.bool("verifyDnsTxt")) methods.push("DNS_TXT");
  if (c.bool("verifyHtmlMeta")) methods.push("HTML_META");
  if (c.bool("verifyWellKnown")) methods.push("WELL_KNOWN_FILE");
  return { allowNewOrganizations: c.bool("allowNewOrganizations"), maxDraftsPerOrg: Math.max(1, c.num("maxDraftsPerOrg") || 25), methods };
}

/**
 * Creates the FIRST Super Administrator invitation. Run on a trusted machine
 * (or the hosting shell) with production env vars:
 *   npm run admin:provision -- --email you@example.com
 * Prints a single-use link (valid 72 h). Refuses if an active Super Admin exists
 * unless --additional is passed (for recovery; audited).
 */
import "dotenv/config";
import { db } from "../src/server/db";
import { createInvitation, inviteUrl } from "../src/server/admin/invitations";

async function main() {
  const args = process.argv.slice(2);
  const email = args[args.indexOf("--email") + 1];
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Usage: npm run admin:provision -- --email you@example.com");
  const existing = await db.adminUser.count({ where: { role: "SUPER_ADMIN", status: "ACTIVE" } });
  if (existing > 0 && !args.includes("--additional")) throw new Error("A Super Administrator already exists. Invite more admins from the admin portal (or pass --additional for recovery).");
  const token = await createInvitation(email, "SUPER_ADMIN", null);
  console.log(`Super Administrator invitation created for ${email}.\nOpen this link within 72 hours (single use):\n\n  ${inviteUrl(token)}\n`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => db.$disconnect());

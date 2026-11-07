/**
 * Tiny database utility for the E2E scripts (no MySQL CLI needed):
 *   tsx tests/e2e/db-util.ts create-db <serverUrl> <name>   CREATE DATABASE (utf8mb4)
 *   tsx tests/e2e/db-util.ts count-users <databaseUrl>      prints the number of users
 */
import mariadb from "mariadb";
import { buildPoolConfig } from "../../src/server/db-config";

async function main() {
  const [cmd, url, name] = process.argv.slice(2);
  if (cmd === "create-db") {
    if (!url || !name || !/^webcenta_e2e_[0-9]+$/.test(name)) throw new Error("usage: create-db <mysql://user:pass@host:port> webcenta_e2e_<n>");
    const { pool } = buildPoolConfig({ DATABASE_URL: `${url.replace(/\/$/, "")}/mysql` });
    const c = await mariadb.createConnection({ ...pool, database: undefined });
    await c.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await c.end();
  } else if (cmd === "count-users") {
    const { pool } = buildPoolConfig({ DATABASE_URL: url ?? "" });
    const c = await mariadb.createConnection({ ...pool, bigIntAsNumber: true });
    const [row] = (await c.query("SELECT COUNT(*) AS n FROM `User`")) as Array<{ n: number }>;
    console.log(row?.n ?? 0);
    await c.end();
  } else {
    throw new Error(`unknown command ${cmd}`);
  }
}
main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});

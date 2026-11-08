/**
 * Helpers for scripts/backup.sh and scripts/restore-drill.sh (MySQL / MariaDB).
 *   tsx scripts/db-tool.ts cnf <url>        print a [client] options file (password never on argv)
 *   tsx scripts/db-tool.ts database <url>   print the database name
 *   tsx scripts/db-tool.ts tables <url>     print the number of tables
 *   tsx scripts/db-tool.ts counts <url>     print "table=rows" for every table (exact COUNT(*))
 *   tsx scripts/db-tool.ts integrity <url>  print integrity checks of a restored copy
 */
import mariadb from "mariadb";
import { buildPoolConfig } from "../src/server/db-config";

const q = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

async function connect(url: string) {
  const { pool } = buildPoolConfig({ DATABASE_URL: url, DATABASE_SSL: process.env.DATABASE_SSL as never, DATABASE_SSL_CA: process.env.DATABASE_SSL_CA });
  return mariadb.createConnection({ ...pool, bigIntAsNumber: true });
}

async function main() {
  const [cmd, url = ""] = process.argv.slice(2);
  const { pool } = buildPoolConfig({ DATABASE_URL: url });
  if (cmd === "cnf") {
    const lines = ["[client]", `user=${q(String(pool.user))}`, `password=${q(String(pool.password))}`];
    if (pool.socketPath) lines.push(`socket=${q(pool.socketPath)}`);
    else lines.push(`host=${q(String(pool.host))}`, `port=${pool.port}`, "protocol=TCP");
    console.log(lines.join("\n"));
    return;
  }
  if (cmd === "database") return console.log(pool.database);
  const c = await connect(url);
  try {
    const tables = ((await c.query(
      "SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
    )) as Array<{ t: string }>).map((r) => r.t);
    if (cmd === "tables") return console.log(tables.length);
    if (cmd === "counts") {
      for (const t of tables) {
        const [r] = (await c.query(`SELECT COUNT(*) AS n FROM \`${t.replace(/`/g, "")}\``)) as Array<{ n: number }>;
        console.log(`${t}=${r?.n}`);
      }
      return;
    }
    if (cmd === "integrity") {
      const one = async (sql: string) => Number(((await c.query(sql)) as Array<{ n: number }>)[0]?.n ?? 0);
      console.log(`check_constraints=${await one("SELECT COUNT(*) n FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()")}`);
      console.log(`foreign_keys=${await one("SELECT COUNT(*) n FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()")}`);
      console.log(`fulltext_indexes=${await one("SELECT COUNT(DISTINCT INDEX_NAME) n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND INDEX_TYPE = 'FULLTEXT'")}`);
      console.log(`binary_collation_columns=${await one("SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLLATION_NAME = 'utf8mb4_bin'")}`);
      console.log(`search_documents_missing=${await one("SELECT COUNT(*) n FROM Listing WHERE searchText IS NULL")}`);
      return;
    }
    throw new Error(`unknown command ${cmd}`);
  } finally {
    await c.end();
  }
}
main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});

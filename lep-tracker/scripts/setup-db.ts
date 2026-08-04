// Applies db/schema.sql to whatever DATABASE_URL points at.
// Usage: DATABASE_URL=... npx tsx scripts/setup-db.ts
import { readFileSync } from "fs";
import { join } from "path";
import { Pool } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const pool = new Pool({
    connectionString: url,
    ssl:
      url.includes("localhost") || url.includes("127.0.0.1")
        ? false
        : { rejectUnauthorized: false },
  });
  const sql = readFileSync(join(process.cwd(), "db", "schema.sql"), "utf8");
  await pool.query(sql);
  console.log("Schema applied.");
  await pool.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

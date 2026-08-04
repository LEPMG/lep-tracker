// Create (or update) a single admin login — for PRODUCTION, without demo data.
// Usage:
//   DATABASE_URL=... ADMIN_EMAIL=you@company.com ADMIN_PASSWORD=secret ADMIN_NAME="Your Name" npx tsx scripts/create-admin.ts
import { Pool } from "pg";
import bcrypt from "bcryptjs";

const url = process.env.DATABASE_URL!;
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME || "Admin";

if (!url || !email || !password) {
  console.error(
    "Set DATABASE_URL, ADMIN_EMAIL and ADMIN_PASSWORD environment variables."
  );
  process.exit(1);
}

const pool = new Pool({
  connectionString: url,
  ssl:
    url.includes("localhost") || url.includes("127.0.0.1")
      ? false
      : { rejectUnauthorized: false },
});

async function main() {
  const hash = bcrypt.hashSync(password!, 10);
  await pool.query(
    `insert into users (email, name, password_hash, role)
       values ($1,$2,$3,'ADMIN')
     on conflict (email) do update
       set password_hash=excluded.password_hash, role='ADMIN', active=true`,
    [email, name, hash]
  );
  console.log(`Admin ready: ${email}`);
  await pool.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

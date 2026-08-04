import { Pool } from "pg";

// Single shared connection pool. On Vercel/serverless we keep the pool on the
// global object so hot reloads and warm lambdas reuse it instead of opening a
// new pool per invocation.
const globalForDb = global as unknown as { _pgPool?: Pool };

export const pool =
  globalForDb._pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    // Supabase / most managed Postgres require SSL. Local dev does not.
    ssl:
      process.env.DATABASE_URL?.includes("localhost") ||
      process.env.DATABASE_URL?.includes("127.0.0.1")
        ? false
        : { rejectUnauthorized: false },
    max: 5,
  });

if (process.env.NODE_ENV !== "production") globalForDb._pgPool = pool;

// Small tagged helper. Usage: const rows = await query<Row>(`select ...`, [args])
export async function query<T = any>(
  text: string,
  params: any[] = []
): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

export async function queryOne<T = any>(
  text: string,
  params: any[] = []
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

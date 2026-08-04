import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { hashPassword, createSession } from "@/lib/auth";

// One-time bootstrap: create the first admin ONLY when no users exist yet.
// After that this endpoint refuses, so it's safe to leave deployed.
export async function POST(req: Request) {
  const existing = await queryOne<{ n: number }>(
    `select count(*)::int as n from users`
  );
  if (existing && existing.n > 0) {
    return NextResponse.json(
      { error: "Setup already completed. Ask an admin to add users." },
      { status: 403 }
    );
  }

  const { name, email, password } = await req.json().catch(() => ({}));
  if (!name || !email || !password || String(password).length < 8) {
    return NextResponse.json(
      { error: "Name, email, and a password of 8+ characters are required." },
      { status: 400 }
    );
  }

  const hash = await hashPassword(String(password));
  const user = await queryOne<{
    id: string;
    email: string;
    name: string;
  }>(
    `insert into users (email, name, password_hash, role)
       values ($1,$2,$3,'ADMIN') returning id, email, name`,
    [String(email).trim(), String(name).trim(), hash]
  );

  if (user) {
    await createSession({
      id: user.id,
      email: user.email,
      name: user.name,
      role: "ADMIN",
    });
  }
  return NextResponse.json({ ok: true });
}

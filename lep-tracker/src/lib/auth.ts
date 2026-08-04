import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { query, queryOne } from "./db";
import type { Role } from "./permissions";

const COOKIE = "lep_session";
const secret = new TextEncoder().encode(
  process.env.SESSION_SECRET || "dev-only-insecure-secret-change-me"
);

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(
  pw: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

// --- session token ---------------------------------------------------------
async function sign(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

export async function createSession(user: SessionUser): Promise<void> {
  const token = await sign(user);
  cookies().set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function destroySession(): void {
  cookies().set(COOKIE, "", { path: "/", maxAge: 0 });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      id: payload.id as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}

// --- credential check ------------------------------------------------------
export async function authenticate(
  email: string,
  password: string
): Promise<SessionUser | null> {
  const row = await queryOne<{
    id: string;
    email: string;
    name: string;
    role: Role;
    password_hash: string;
    active: boolean;
  }>(
    `select id, email, name, role, password_hash, active
       from users where lower(email) = lower($1)`,
    [email]
  );
  if (!row || !row.active) return null;
  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

// Throw-if-not-logged-in helper for server components / actions.
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

export { query };

"use server";

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { requireUser, hashPassword } from "@/lib/auth";
import { canAdminUsers } from "@/lib/permissions";

async function assertAdmin() {
  const user = await requireUser();
  if (!canAdminUsers(user.role)) throw new Error("Not authorized");
}

export async function createUser(formData: FormData) {
  await assertAdmin();
  const email = String(formData.get("email") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const password = String(formData.get("password") || "");
  const role = String(formData.get("role") || "FIELD");
  if (!email || !name || !password) return;
  const hash = await hashPassword(password);
  await query(
    `insert into users (email, name, password_hash, role)
       values ($1,$2,$3,$4)
     on conflict (email) do nothing`,
    [email, name, hash, role]
  );
  revalidatePath("/admin/users");
}

export async function updateUser(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id"));
  const role = String(formData.get("role"));
  const active = formData.get("active") === "on";
  await query(
    `update users set role=$1, active=$2, updated_at=now() where id=$3`,
    [role, active, id]
  );
  revalidatePath("/admin/users");
}

export async function resetPassword(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id"));
  const password = String(formData.get("password") || "");
  if (!password) return;
  const hash = await hashPassword(password);
  await query(`update users set password_hash=$1, updated_at=now() where id=$2`, [
    hash,
    id,
  ]);
  revalidatePath("/admin/users");
}

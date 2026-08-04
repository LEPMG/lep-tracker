"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canManage } from "@/lib/permissions";

export async function createVendor(formData: FormData) {
  const user = await requireUser();
  if (user.role === "MGMT_RO") throw new Error("Not authorized");
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  await query(
    `insert into vendors (name, service, contact, phone, email)
     values ($1,$2,$3,$4,$5)`,
    [
      name,
      strOrNull(formData.get("service")),
      strOrNull(formData.get("contact")),
      strOrNull(formData.get("phone")),
      strOrNull(formData.get("email")),
    ]
  );
  revalidatePath("/vendors");
}

export async function addCostEntry(formData: FormData) {
  const user = await requireUser();
  if (!canManage(user.role) && user.role !== "FIELD")
    throw new Error("Not authorized");
  const amount = Number(formData.get("amount"));
  if (!amount) return;
  await query(
    `insert into cost_entries
       (work_order_id, vendor_id, category, description, amount, cost_date, invoice_no)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [
      strOrNull(formData.get("work_order_id")),
      strOrNull(formData.get("vendor_id")),
      String(formData.get("category") || "OTHER"),
      strOrNull(formData.get("description")),
      amount,
      formData.get("cost_date")
        ? new Date(String(formData.get("cost_date")))
        : new Date(),
      strOrNull(formData.get("invoice_no")),
    ]
  );
  const to = strOrNull(formData.get("redirect_to"));
  revalidatePath("/vendors");
  revalidatePath("/");
  if (to) {
    revalidatePath(to);
    redirect(to);
  }
}

function strOrNull(v: FormDataEntryValue | null): string | null {
  const s = v ? String(v).trim() : "";
  return s === "" ? null : s;
}

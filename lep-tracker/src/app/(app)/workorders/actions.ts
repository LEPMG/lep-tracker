"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function createWorkOrder(formData: FormData) {
  const user = await requireUser();
  if (user.role === "MGMT_RO") throw new Error("Not authorized");

  const title = String(formData.get("title") || "").trim();
  if (!title) return;

  const rows = await query<{ id: string }>(
    `insert into work_orders
       (title, description, status, priority, well_id, battery_id,
        assigned_to_id, created_by_id, vendor_id, due_date, est_cost)
     values ($1,$2,'OPEN',$3,$4,$5,$6,$7,$8,$9,$10)
     returning id`,
    [
      title,
      strOrNull(formData.get("description")),
      String(formData.get("priority") || "MEDIUM"),
      strOrNull(formData.get("well_id")),
      strOrNull(formData.get("battery_id")),
      strOrNull(formData.get("assigned_to_id")),
      user.id,
      strOrNull(formData.get("vendor_id")),
      formData.get("due_date")
        ? new Date(String(formData.get("due_date")))
        : null,
      numOrNull(formData.get("est_cost")),
    ]
  );
  revalidatePath("/workorders");
  revalidatePath("/");
  redirect(`/workorders/${rows[0].id}`);
}

export async function updateWorkOrder(formData: FormData) {
  const user = await requireUser();
  if (user.role === "MGMT_RO") throw new Error("Not authorized");
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  const completedAt = status === "COMPLETED" ? new Date() : null;
  await query(
    `update work_orders
        set status=$1, priority=$2, assigned_to_id=$3, vendor_id=$4,
            due_date=$5, completed_at=coalesce($6, completed_at), updated_at=now()
      where id=$7`,
    [
      status,
      String(formData.get("priority") || "MEDIUM"),
      strOrNull(formData.get("assigned_to_id")),
      strOrNull(formData.get("vendor_id")),
      formData.get("due_date")
        ? new Date(String(formData.get("due_date")))
        : null,
      completedAt,
      id,
    ]
  );
  revalidatePath(`/workorders/${id}`);
  revalidatePath("/workorders");
  revalidatePath("/");
}

export async function addActionItem(formData: FormData) {
  const user = await requireUser();
  if (user.role === "MGMT_RO") throw new Error("Not authorized");
  const woId = String(formData.get("work_order_id"));
  const text = String(formData.get("text") || "").trim();
  if (!text) return;
  await query(
    `insert into action_items (work_order_id, text, owner_id, due_date)
     values ($1,$2,$3,$4)`,
    [
      woId,
      text,
      strOrNull(formData.get("owner_id")),
      formData.get("due_date")
        ? new Date(String(formData.get("due_date")))
        : null,
    ]
  );
  revalidatePath(`/workorders/${woId}`);
}

export async function toggleActionItem(formData: FormData) {
  await requireUser();
  const id = String(formData.get("id"));
  const woId = String(formData.get("work_order_id"));
  const done = formData.get("done") === "true";
  await query(
    `update action_items
        set done=$1, completed_at=case when $1 then now() else null end
      where id=$2`,
    [done, id]
  );
  revalidatePath(`/workorders/${woId}`);
}

export async function addWorkOrderComment(formData: FormData) {
  const user = await requireUser();
  const woId = String(formData.get("work_order_id"));
  const body = String(formData.get("body") || "").trim();
  if (!body) return;
  await query(
    `insert into comments (body, author_id, work_order_id) values ($1,$2,$3)`,
    [body, user.id, woId]
  );
  revalidatePath(`/workorders/${woId}`);
}

function strOrNull(v: FormDataEntryValue | null): string | null {
  const s = v ? String(v).trim() : "";
  return s === "" ? null : s;
}
function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = v ? String(v).trim() : "";
  return s === "" ? null : Number(s);
}

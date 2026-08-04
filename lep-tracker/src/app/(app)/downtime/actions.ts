"use server";

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export async function reportDowntime(formData: FormData) {
  const user = await requireUser();
  if (user.role === "MGMT_RO") throw new Error("Not authorized");

  const wellId = strOrNull(formData.get("well_id"));
  const reason = String(formData.get("reason") || "").trim();
  if (!reason) return;

  const startAt = formData.get("start_at")
    ? new Date(String(formData.get("start_at")))
    : new Date();

  // find battery from well if not given
  let batteryId = strOrNull(formData.get("battery_id"));
  if (!batteryId && wellId) {
    const w = await query<{ battery_id: string | null }>(
      `select battery_id from wells where id=$1`,
      [wellId]
    );
    batteryId = w[0]?.battery_id ?? null;
  }

  await query(
    `insert into downtime_events
       (well_id, battery_id, reason, category, start_at, est_bopd_loss, owner_id)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [
      wellId,
      batteryId,
      reason,
      strOrNull(formData.get("category")),
      startAt,
      numOrNull(formData.get("est_bopd_loss")),
      strOrNull(formData.get("owner_id")) ?? user.id,
    ]
  );

  // flip the well to DOWN
  if (wellId) {
    await query(`update wells set status='DOWN', updated_at=now() where id=$1`, [
      wellId,
    ]);
  }

  revalidatePath("/downtime");
  revalidatePath("/");
  revalidatePath("/wells");
}

export async function resolveDowntime(formData: FormData) {
  const user = await requireUser();
  if (user.role === "MGMT_RO") throw new Error("Not authorized");

  const id = String(formData.get("id"));
  const bringUp = formData.get("bring_up") === "on";

  const rows = await query<{ well_id: string | null }>(
    `update downtime_events
        set status='RESOLVED', end_at=now(), updated_at=now()
      where id=$1 returning well_id`,
    [id]
  );
  const wellId = rows[0]?.well_id;
  if (bringUp && wellId) {
    await query(`update wells set status='UP', updated_at=now() where id=$1`, [
      wellId,
    ]);
  }
  const note = String(formData.get("note") || "").trim();
  if (note) {
    await query(
      `insert into comments (body, author_id, downtime_id) values ($1,$2,$3)`,
      [note, user.id, id]
    );
  }
  revalidatePath("/downtime");
  revalidatePath("/");
  revalidatePath("/wells");
}

export async function addDowntimeComment(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const body = String(formData.get("body") || "").trim();
  if (!body) return;
  await query(
    `insert into comments (body, author_id, downtime_id) values ($1,$2,$3)`,
    [body, user.id, id]
  );
  revalidatePath("/downtime");
}

function strOrNull(v: FormDataEntryValue | null): string | null {
  const s = v ? String(v).trim() : "";
  return s === "" ? null : s;
}
function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = v ? String(v).trim() : "";
  return s === "" ? null : Number(s);
}

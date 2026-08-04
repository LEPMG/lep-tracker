"use server";

import { revalidatePath } from "next/cache";
import { query, queryOne } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { toTotalInches, barrelsFromInches } from "@/lib/gauge";

export async function saveGaugeReading(formData: FormData) {
  const user = await requireUser();
  if (user.role === "MGMT_RO") throw new Error("Not authorized");

  const batteryId = String(formData.get("battery_id"));
  const readingDate = String(formData.get("reading_date"));
  if (!batteryId || !readingDate) return;

  // tanks on this battery
  const tanks = await query<{ id: string; bbls_per_inch: number }>(
    `select id, bbls_per_inch from tanks where battery_id=$1 and active`,
    [batteryId]
  );

  // upsert the gauge reading (one per battery+date)
  const gr = await queryOne<{ id: string }>(
    `insert into gauge_readings (battery_id, reading_date, gauged_by_id, notes)
       values ($1,$2,$3,$4)
     on conflict (battery_id, reading_date)
       do update set gauged_by_id=excluded.gauged_by_id, notes=excluded.notes
     returning id`,
    [batteryId, readingDate, user.id, strOrNull(formData.get("notes"))]
  );
  const grId = gr!.id;

  // replace tank readings for this gauge
  await query(`delete from tank_readings where gauge_reading_id=$1`, [grId]);

  for (const t of tanks) {
    const feet = Number(formData.get(`feet_${t.id}`) || 0);
    const inches = Number(formData.get(`inches_${t.id}`) || 0);
    // skip tanks with no entry at all
    if (
      formData.get(`feet_${t.id}`) === null &&
      formData.get(`inches_${t.id}`) === null
    )
      continue;
    const totalInches = toTotalInches(feet, inches);
    const barrels = barrelsFromInches(totalInches, Number(t.bbls_per_inch));
    await query(
      `insert into tank_readings
         (gauge_reading_id, tank_id, feet, inches, total_inches, barrels)
       values ($1,$2,$3,$4,$5,$6)`,
      [grId, t.id, feet, inches, totalInches, barrels]
    );
  }

  revalidatePath("/production");
  revalidatePath("/");
}

export async function addRunTicket(formData: FormData) {
  const user = await requireUser();
  if (user.role === "MGMT_RO") throw new Error("Not authorized");
  const batteryId = String(formData.get("battery_id"));
  const gross = Number(formData.get("gross_bbls"));
  if (!batteryId || !gross) return;
  await query(
    `insert into run_tickets
       (battery_id, ticket_date, type, gross_bbls, net_bbls, bsw, gravity_api,
        price_per_bbl, ticket_number, hauler, recorded_by_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      batteryId,
      String(formData.get("ticket_date")),
      String(formData.get("type") || "OIL_SALE"),
      gross,
      numOrNull(formData.get("net_bbls")),
      numOrNull(formData.get("bsw")),
      numOrNull(formData.get("gravity_api")),
      numOrNull(formData.get("price_per_bbl")),
      strOrNull(formData.get("ticket_number")),
      strOrNull(formData.get("hauler")),
      user.id,
    ]
  );
  revalidatePath("/production");
  revalidatePath("/");
}

function strOrNull(v: FormDataEntryValue | null): string | null {
  const s = v ? String(v).trim() : "";
  return s === "" ? null : s;
}
function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = v ? String(v).trim() : "";
  return s === "" ? null : Number(s);
}

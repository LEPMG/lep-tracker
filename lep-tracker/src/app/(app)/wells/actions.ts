"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canManage } from "@/lib/permissions";
import { parseCsv } from "@/lib/csv";

async function assertManage() {
  const user = await requireUser();
  if (!canManage(user.role)) throw new Error("Not authorized");
  return user;
}

export async function createBattery(formData: FormData) {
  await assertManage();
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  await query(
    `insert into batteries (name, code, field, county, state) values ($1,$2,$3,$4,$5)`,
    [
      name,
      strOrNull(formData.get("code")),
      strOrNull(formData.get("field")),
      strOrNull(formData.get("county")),
      strOrNull(formData.get("state")),
    ]
  );
  revalidatePath("/wells");
}

export async function createWell(formData: FormData) {
  await assertManage();
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  await query(
    `insert into wells (name, api_number, battery_id, field, county, state, status,
                        test_oil_bopd, test_water_bwpd, test_gas_mcfd, test_date)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      name,
      strOrNull(formData.get("api_number")),
      strOrNull(formData.get("battery_id")),
      strOrNull(formData.get("field")),
      strOrNull(formData.get("county")),
      strOrNull(formData.get("state")),
      String(formData.get("status") || "UP"),
      numOrNull(formData.get("test_oil_bopd")),
      numOrNull(formData.get("test_water_bwpd")),
      numOrNull(formData.get("test_gas_mcfd")),
      strOrNull(formData.get("test_date")),
    ]
  );
  revalidatePath("/wells");
  revalidatePath("/downtime");
}

export async function createTank(formData: FormData) {
  await assertManage();
  const batteryId = strOrNull(formData.get("battery_id"));
  const name = String(formData.get("name") || "").trim();
  const bpi = Number(formData.get("bbls_per_inch"));
  if (!batteryId || !name || !bpi) return;
  await query(
    `insert into tanks (battery_id, name, type, size_bbls, bbls_per_inch)
     values ($1,$2,$3,$4,$5)`,
    [
      batteryId,
      name,
      String(formData.get("type") || "OIL"),
      numOrNull(formData.get("size_bbls")),
      bpi,
    ]
  );
  revalidatePath("/wells");
  revalidatePath("/production");
}

export async function setWellTest(formData: FormData) {
  await assertManage();
  const id = String(formData.get("id"));
  await query(
    `update wells set
       test_oil_bopd=$1, test_water_bwpd=$2, test_gas_mcfd=$3,
       test_date=coalesce($4, test_date), updated_at=now()
     where id=$5`,
    [
      numOrNull(formData.get("test_oil_bopd")),
      numOrNull(formData.get("test_water_bwpd")),
      numOrNull(formData.get("test_gas_mcfd")),
      strOrNull(formData.get("test_date")),
      id,
    ]
  );
  revalidatePath("/wells");
  revalidatePath("/downtime");
}

export async function setWellStatus(formData: FormData) {
  const user = await requireUser();
  // field users may flip status; view-only cannot
  if (user.role === "MGMT_RO") throw new Error("Not authorized");
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  await query(`update wells set status=$1, updated_at=now() where id=$2`, [
    status,
    id,
  ]);

  // Keep Down Wells and the dashboard in step with the status set here: going
  // DOWN opens a downtime event, coming off DOWN resolves the open one.
  if (status === "DOWN") {
    await openDowntimeForWell(id, user.id);
  } else {
    await resolveOpenDowntimeForWell(id);
  }

  revalidatePath("/wells");
  revalidatePath("/downtime");
  revalidatePath("/");
}

/**
 * Open a downtime event for a well unless one is already open. The estimated
 * loss comes from the well's own oil test rate, so the dashboard totals reflect
 * the well tests already in the system.
 */
async function openDowntimeForWell(wellId: string, ownerId: string) {
  await query(
    `insert into downtime_events
       (well_id, battery_id, reason, start_at, est_bopd_loss, owner_id)
     select w.id, w.battery_id, $2, now(), w.test_oil_bopd, $3
       from wells w
      where w.id = $1
        and not exists (
          select 1 from downtime_events d
           where d.well_id = w.id and d.status = 'OPEN'
        )`,
    [wellId, "Marked down from Wells page", ownerId]
  );
}

async function resolveOpenDowntimeForWell(wellId: string) {
  await query(
    `update downtime_events set status='RESOLVED', end_at=now(), updated_at=now()
      where well_id=$1 and status='OPEN'`,
    [wellId]
  );
}

function strOrNull(v: FormDataEntryValue | null): string | null {
  const s = v ? String(v).trim() : "";
  return s === "" ? null : s;
}
function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = v ? String(v).trim() : "";
  return s === "" ? null : Number(s);
}

// ---------------------------------------------------------------------------
// Bulk import from CSV (batteries, tanks, wells). Any file may be omitted.
// ---------------------------------------------------------------------------
const WELL_STATUSES = ["UP", "DOWN", "SHUT_IN", "INACTIVE"];
const TANK_TYPES = ["OIL", "WATER", "GAS_COND"];

function pick(r: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) if (r[k] != null && r[k] !== "") return r[k];
  return "";
}
function sn(v: string): string | null {
  const s = v.trim();
  return s === "" ? null : s;
}
function nn(v: string): number | null {
  const s = v.trim();
  return s === "" ? null : Number(s);
}

async function fileText(v: FormDataEntryValue | null): Promise<string> {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof (v as File).text === "function") return await (v as File).text();
  return "";
}

export async function importData(formData: FormData) {
  await assertManage();
  const result = { batteries: 0, tanks: 0, wells: 0, errors: [] as string[] };

  // battery name -> id (case-insensitive), preloaded with existing
  const existing = await query<{ id: string; name: string }>(
    `select id, name from batteries`
  );
  const batMap = new Map(existing.map((b) => [b.name.toLowerCase(), b.id]));

  // 1) batteries
  const batText = await fileText(formData.get("batteries"));
  for (const r of parseCsv(batText)) {
    const name = pick(r, "name", "battery", "battery name", "battery_name");
    if (!name) continue;
    if (batMap.has(name.toLowerCase())) continue; // reuse existing
    const rows = await query<{ id: string }>(
      `insert into batteries (name,code,field,county,state)
       values ($1,$2,$3,$4,$5) returning id`,
      [
        name,
        sn(pick(r, "code")),
        sn(pick(r, "field", "lease")),
        sn(pick(r, "county")),
        sn(pick(r, "state")),
      ]
    );
    batMap.set(name.toLowerCase(), rows[0].id);
    result.batteries++;
  }

  // 2) tanks
  const tankText = await fileText(formData.get("tanks"));
  for (const r of parseCsv(tankText)) {
    const batName = pick(r, "battery", "battery name", "battery_name");
    const bid = batName ? batMap.get(batName.toLowerCase()) : undefined;
    const tname = pick(r, "tank", "name", "tank name", "tank_name");
    const bpi = Number(pick(r, "bbls_per_inch", "bbls per inch", "bpi"));
    if (!bid || !tname || !bpi) {
      result.errors.push(
        `Tank "${tname || "?"}" (battery "${batName || "?"}") skipped — needs battery, tank name, and bbls_per_inch`
      );
      continue;
    }
    const type = pick(r, "type").toUpperCase();
    await query(
      `insert into tanks (battery_id,name,type,size_bbls,bbls_per_inch)
       values ($1,$2,$3,$4,$5)`,
      [
        bid,
        tname,
        TANK_TYPES.includes(type) ? type : "OIL",
        nn(pick(r, "size_bbls", "size", "size bbls")),
        bpi,
      ]
    );
    result.tanks++;
  }

  // 3) wells
  const wellText = await fileText(formData.get("wells"));
  for (const r of parseCsv(wellText)) {
    const name = pick(r, "well", "name", "well name", "well_name");
    if (!name) continue;
    const batName = pick(r, "battery", "battery name", "battery_name");
    const bid = batName ? batMap.get(batName.toLowerCase()) ?? null : null;
    const status = pick(r, "status").toUpperCase();
    const st = WELL_STATUSES.includes(status) ? status : "UP";
    const api = sn(pick(r, "api", "api_number", "api number", "api #"));
    const oil = nn(pick(r, "test_oil_bopd", "oil_bopd", "oil bopd", "oil", "bopd"));
    const water = nn(
      pick(r, "test_water_bwpd", "water_bwpd", "water bwpd", "water", "bwpd")
    );
    const gas = nn(pick(r, "test_gas_mcfd", "gas_mcfd", "gas mcfd", "gas", "mcfd"));
    const testDate = sn(pick(r, "test_date", "test date"));
    if (api) {
      await query(
        `insert into wells (name,api_number,battery_id,status,field,county,state,
                            test_oil_bopd,test_water_bwpd,test_gas_mcfd,test_date)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         on conflict (api_number) do update set
           name=excluded.name, battery_id=excluded.battery_id,
           status=excluded.status, field=excluded.field,
           county=excluded.county, state=excluded.state,
           test_oil_bopd=coalesce(excluded.test_oil_bopd, wells.test_oil_bopd),
           test_water_bwpd=coalesce(excluded.test_water_bwpd, wells.test_water_bwpd),
           test_gas_mcfd=coalesce(excluded.test_gas_mcfd, wells.test_gas_mcfd),
           test_date=coalesce(excluded.test_date, wells.test_date),
           updated_at=now()`,
        [
          name,
          api,
          bid,
          st,
          sn(pick(r, "field", "lease")),
          sn(pick(r, "county")),
          sn(pick(r, "state")),
          oil,
          water,
          gas,
          testDate,
        ]
      );
    } else {
      await query(
        `insert into wells (name,api_number,battery_id,status,field,county,state,
                            test_oil_bopd,test_water_bwpd,test_gas_mcfd,test_date)
         values ($1,null,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          name,
          bid,
          st,
          sn(pick(r, "field", "lease")),
          sn(pick(r, "county")),
          sn(pick(r, "state")),
          oil,
          water,
          gas,
          testDate,
        ]
      );
    }
    result.wells++;
  }

  revalidatePath("/wells");
  revalidatePath("/downtime");
  revalidatePath("/production");

  const q = new URLSearchParams({
    imported: `${result.batteries}-${result.tanks}-${result.wells}`,
  });
  if (result.errors.length)
    q.set("err", result.errors.slice(0, 4).join(" | "));
  redirect(`/wells/import?${q.toString()}`);
}

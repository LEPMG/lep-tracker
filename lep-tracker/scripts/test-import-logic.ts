// Verifies the CSV parser + import behavior + state/field filtering directly
// against the DB (no HTTP server needed). Mirrors the logic in
// src/app/(app)/wells/actions.ts importData().
import { readFileSync } from "fs";
import { Pool } from "pg";
import { parseCsv } from "../src/lib/csv";

const url = "postgresql://lep:lep_dev_pw@127.0.0.1:5432/lep";
const pool = new Pool({ connectionString: url });
const q = (t: string, p: any[] = []) => pool.query(t, p);

const pick = (r: Record<string, string>, ...keys: string[]) => {
  for (const k of keys) if (r[k]) return r[k];
  return "";
};
const sn = (v: string) => (v.trim() === "" ? null : v.trim());

let fails = 0;
const check = (name: string, cond: boolean) => {
  if (!cond) fails++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
};

async function main() {
  // clean slate for the import test
  await q(`truncate tank_readings, gauge_readings, run_tickets, tanks, wells, batteries restart identity cascade`);

  // battery map
  const batMap = new Map<string, string>();

  // 1) batteries
  for (const r of parseCsv(readFileSync("public/templates/batteries.csv", "utf8"))) {
    const name = pick(r, "name", "battery");
    if (!name || batMap.has(name.toLowerCase())) continue;
    const rows = await q(
      `insert into batteries (name,code,field,county,state) values ($1,$2,$3,$4,$5) returning id`,
      [name, sn(pick(r, "code")), sn(pick(r, "field")), sn(pick(r, "county")), sn(pick(r, "state"))]
    );
    batMap.set(name.toLowerCase(), rows.rows[0].id);
  }

  // 2) tanks
  for (const r of parseCsv(readFileSync("public/templates/tanks.csv", "utf8"))) {
    const bid = batMap.get(pick(r, "battery").toLowerCase());
    const tname = pick(r, "tank", "name");
    const bpi = Number(pick(r, "bbls_per_inch"));
    if (!bid || !tname || !bpi) continue;
    await q(`insert into tanks (battery_id,name,type,size_bbls,bbls_per_inch) values ($1,$2,$3,$4,$5)`, [
      bid, tname, pick(r, "type").toUpperCase() || "OIL", sn(pick(r, "size_bbls")), bpi,
    ]);
  }

  // 3) wells (with well-test rates)
  for (const r of parseCsv(readFileSync("public/templates/wells.csv", "utf8"))) {
    const name = pick(r, "well", "name");
    if (!name) continue;
    const bid = batMap.get(pick(r, "battery").toLowerCase()) ?? null;
    const api = sn(pick(r, "api_number", "api"));
    await q(
      `insert into wells (name,api_number,battery_id,status,field,county,state,
                          test_oil_bopd,test_water_bwpd,test_gas_mcfd,test_date)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict (api_number) do update set state=excluded.state,
         test_oil_bopd=excluded.test_oil_bopd`,
      [
        name, api, bid, pick(r, "status").toUpperCase() || "UP",
        sn(pick(r, "field")), sn(pick(r, "county")), sn(pick(r, "state")),
        Number(pick(r, "test_oil_bopd")) || null,
        Number(pick(r, "test_water_bwpd")) || null,
        Number(pick(r, "test_gas_mcfd")) || null,
        sn(pick(r, "test_date")),
      ]
    );
  }

  const jal = await q(
    `select test_oil_bopd, test_water_bwpd, test_gas_mcfd from wells where name='Jal Unit #1'`
  );
  check(
    "Jal Unit #1 test rates loaded (28/60/120)",
    Number(jal.rows[0].test_oil_bopd) === 28 &&
      Number(jal.rows[0].test_water_bwpd) === 60 &&
      Number(jal.rows[0].test_gas_mcfd) === 120
  );
  const nr2 = await q(
    `select test_oil_bopd from wells where name='North Ranch #2'`
  );
  check("North Ranch #2 oil test = 35 (prefills BOPD loss)", Number(nr2.rows[0].test_oil_bopd) === 35);

  const counts = await q(`select count(*)::int n from wells`);
  check("wells imported (3 expected)", counts.rows[0].n === 3);
  const bats = await q(`select count(*)::int n from batteries`);
  check("batteries imported (2 expected)", bats.rows[0].n === 2);
  const tanks = await q(`select count(*)::int n from tanks`);
  check("tanks imported (3 expected)", tanks.rows[0].n === 3);

  // --- filter tests (mirror page WHERE clauses) ---
  const nm = await q(`select name from wells where state=$1 order by name`, ["NM"]);
  check("NM filter returns only Jal Unit #1", nm.rows.length === 1 && nm.rows[0].name === "Jal Unit #1");

  const tx = await q(`select name from wells where state=$1 order by name`, ["TX"]);
  check("TX filter returns 2 North Ranch wells", tx.rows.length === 2 && tx.rows.every((r: any) => r.name.startsWith("North Ranch")));

  const byField = await q(`select count(*)::int n from wells where field=$1`, ["Jal"]);
  check("Field=Jal returns 1 well", byField.rows[0].n === 1);

  const states = await q(`select distinct state v from wells where state is not null order by state`);
  check("distinct states = [NM, TX]", states.rows.map((r: any) => r.v).join(",") === "NM,TX");

  // re-import wells is idempotent (upsert by api) -> still 3
  for (const r of parseCsv(readFileSync("public/templates/wells.csv", "utf8"))) {
    const api = sn(pick(r, "api_number", "api"));
    const name = pick(r, "well", "name");
    await q(
      `insert into wells (name,api_number,status,field,state) values ($1,$2,'UP',$3,$4)
       on conflict (api_number) do update set state=excluded.state`,
      [name, api, sn(pick(r, "field")), sn(pick(r, "state"))]
    );
  }
  const after = await q(`select count(*)::int n from wells`);
  check("re-import stays 3 (no duplicates via api upsert)", after.rows[0].n === 3);

  console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAIL`);
  await pool.end();
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });

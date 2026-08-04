// Seeds demo data + a starter admin. Safe to run on a fresh database.
// Usage: DATABASE_URL=... npx tsx scripts/seed.ts
//
// Set ADMIN_EMAIL / ADMIN_PASSWORD to control the admin login (defaults below).
import { Pool } from "pg";
import bcrypt from "bcryptjs";

const url = process.env.DATABASE_URL!;
const pool = new Pool({
  connectionString: url,
  ssl:
    url.includes("localhost") || url.includes("127.0.0.1")
      ? false
      : { rejectUnauthorized: false },
});

const q = (text: string, params: any[] = []) => pool.query(text, params);
const one = async (text: string, params: any[] = []) =>
  (await pool.query(text, params)).rows[0];
const oneId = async (text: string, params: any[] = []): Promise<string> =>
  (await pool.query(text, params)).rows[0].id;

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(6, 0, 0, 0);
  return d;
}

async function main() {
  console.log("Clearing existing data…");
  await q(`truncate
    comments, action_items, cost_entries, work_orders, downtime_events,
    tank_readings, gauge_readings, run_tickets, tanks, wells, batteries,
    vendors, users restart identity cascade`);

  // --- users ---------------------------------------------------------------
  const adminEmail = process.env.ADMIN_EMAIL || "admin@lep.local";
  const adminPw = process.env.ADMIN_PASSWORD || "changeme123";
  const hash = (pw: string) => bcrypt.hashSync(pw, 10);

  const admin = await oneId(
    `insert into users (email,name,password_hash,role) values ($1,$2,$3,'ADMIN') returning id`,
    [adminEmail, "Admin User", hash(adminPw)]
  );
  const pumper = await oneId(
    `insert into users (email,name,password_hash,role) values ($1,$2,$3,'FIELD') returning id`,
    ["pumper@lep.local", "Jesse Pumper", hash("changeme123")]
  );
  const mgr = await oneId(
    `insert into users (email,name,password_hash,role) values ($1,$2,$3,'MGMT_RW') returning id`,
    ["manager@lep.local", "Dana Manager", hash("changeme123")]
  );
  await one(
    `insert into users (email,name,password_hash,role) values ($1,$2,$3,'MGMT_RO') returning id`,
    ["exec@lep.local", "Sam Exec", hash("changeme123")]
  );

  // --- vendors -------------------------------------------------------------
  const vPull = await oneId(
    `insert into vendors (name,service,contact,phone) values ($1,$2,$3,$4) returning id`,
    ["Big Country Well Service", "Pulling unit", "Rob", "555-0142"]
  );
  const vHot = await oneId(
    `insert into vendors (name,service,contact,phone) values ($1,$2,$3,$4) returning id`,
    ["Permian Hot Oil", "Hot oil / chemical", "Luis", "555-0199"]
  );
  const vElec = await oneId(
    `insert into vendors (name,service,contact,phone) values ($1,$2,$3,$4) returning id`,
    ["Sparks Electric", "Electrician", "Dale", "555-0177"]
  );

  // --- batteries + tanks ---------------------------------------------------
  const batteries: { id: string; name: string; oil: string; water: string }[] =
    [];
  const batteryDefs = [
    { name: "North Ranch Battery", field: "North Ranch", county: "Midland" },
    { name: "South Draw Battery", field: "South Draw", county: "Martin" },
    { name: "West Mesa Battery", field: "West Mesa", county: "Howard" },
  ];
  for (const b of batteryDefs) {
    const bat = await one(
      `insert into batteries (name,field,county,state) values ($1,$2,$3,'TX') returning id`,
      [b.name, b.field, b.county]
    );
    const oil = await one(
      `insert into tanks (battery_id,name,type,size_bbls,bbls_per_inch)
         values ($1,$2,'OIL',$3,$4) returning id`,
      [bat.id, "Oil Tank #1", 400, 1.87]
    );
    const water = await one(
      `insert into tanks (battery_id,name,type,size_bbls,bbls_per_inch)
         values ($1,$2,'WATER',$3,$4) returning id`,
      [bat.id, "Water Tank #1", 400, 1.87]
    );
    batteries.push({ id: bat.id, name: b.name, oil: oil.id, water: water.id });
  }

  // --- wells ---------------------------------------------------------------
  const wells: { id: string; name: string; battery: string }[] = [];
  let wn = 1;
  for (const bat of batteries) {
    for (let i = 1; i <= 3; i++) {
      const name = `${bat.name.split(" ")[0]} #${i}`;
      const w = await one(
        `insert into wells (name,api_number,battery_id,status,field,state)
           values ($1,$2,$3,'UP','TX-Field','TX') returning id`,
        [name, `42-000-${String(10000 + wn).padStart(5, "0")}`, bat.id]
      );
      wells.push({ id: w.id, name, battery: bat.id });
      wn++;
    }
  }

  // --- gauge readings over the last week (build a rising oil trend) --------
  for (const bat of batteries) {
    let oilInches = 20; // start ~2 tanks
    let waterInches = 15;
    for (let d = 7; d >= 0; d--) {
      const date = daysAgo(d);
      const oilBpi = 1.87;
      const waterBpi = 1.87;

      // Sell first if the oil tank is getting full, so the drawdown and the
      // run ticket land on the SAME reading date (clean reconciliation).
      if (oilInches > 90) {
        const sold = +((oilInches - 20) * oilBpi).toFixed(2);
        await q(
          `insert into run_tickets (battery_id,ticket_date,type,gross_bbls,net_bbls,bsw,gravity_api,price_per_bbl,ticket_number,hauler,recorded_by_id)
             values ($1,$2,'OIL_SALE',$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            bat.id,
            date.toISOString().slice(0, 10),
            sold,
            +(sold * 0.99).toFixed(2),
            1.0,
            38.5,
            72.5,
            `RT-${bat.name.slice(0, 3).toUpperCase()}-${d}`,
            "Lonestar Crude Hauling",
            pumper,
          ]
        );
        oilInches = 20; // tank drawn back down on the same day
      }

      const gr = await one(
        `insert into gauge_readings (battery_id, reading_date, gauged_by_id)
           values ($1,$2,$3) returning id`,
        [bat.id, date.toISOString().slice(0, 10), pumper]
      );
      const oilBbls = +(oilInches * oilBpi).toFixed(2);
      const waterBbls = +(waterInches * waterBpi).toFixed(2);
      await q(
        `insert into tank_readings (gauge_reading_id,tank_id,feet,inches,total_inches,barrels)
           values ($1,$2,$3,$4,$5,$6)`,
        [
          gr.id,
          bat.oil,
          Math.floor(oilInches / 12),
          +(oilInches % 12).toFixed(1),
          oilInches,
          oilBbls,
        ]
      );
      await q(
        `insert into tank_readings (gauge_reading_id,tank_id,feet,inches,total_inches,barrels)
           values ($1,$2,$3,$4,$5,$6)`,
        [
          gr.id,
          bat.water,
          Math.floor(waterInches / 12),
          +(waterInches % 12).toFixed(1),
          waterInches,
          waterBbls,
        ]
      );
      oilInches += 18; // ~34 bopd
      waterInches += 10;
    }
  }

  // --- downtime: one open, one resolved ------------------------------------
  const downWell = wells[2];
  await q(`update wells set status='DOWN' where id=$1`, [downWell.id]);
  const dt = await one(
    `insert into downtime_events (well_id,battery_id,status,reason,category,start_at,est_bopd_loss,owner_id)
       values ($1,$2,'OPEN',$3,'Mechanical',$4,$5,$6) returning id`,
    [
      downWell.id,
      downWell.battery,
      "Rod parted — waiting on pulling unit",
      daysAgo(2),
      35,
      mgr,
    ]
  );
  await q(
    `insert into comments (body,author_id,downtime_id) values ($1,$2,$3)`,
    ["Called Big Country, scheduled for tomorrow AM.", mgr, dt.id]
  );
  await one(
    `insert into downtime_events (well_id,battery_id,status,reason,category,start_at,end_at,est_bopd_loss,owner_id)
       values ($1,$2,'RESOLVED',$3,'Electrical',$4,$5,$6,$7) returning id`,
    [
      wells[5].id,
      wells[5].battery,
      "Tripped breaker after storm",
      daysAgo(6),
      daysAgo(5),
      20,
      pumper,
    ]
  );

  // --- work orders + action items + costs ----------------------------------
  const wo1 = await one(
    `insert into work_orders (title,description,status,priority,well_id,battery_id,downtime_id,assigned_to_id,created_by_id,vendor_id,due_date,est_cost)
       values ($1,$2,'IN_PROGRESS','URGENT',$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
    [
      "Pull and replace rod string",
      "Rod parted on North Ranch #3. Pull, inspect, replace as needed.",
      downWell.id,
      downWell.battery,
      dt.id,
      pumper,
      mgr,
      vPull,
      daysAgo(-1),
      12000,
    ]
  );
  await q(
    `insert into action_items (work_order_id,text,owner_id,done) values
      ($1,$2,$3,true),($1,$4,$3,false),($1,$5,$3,false)`,
    [
      wo1.id,
      "Schedule pulling unit",
      pumper,
      "Pull rods & inspect pump",
      "Run new rods, return to production",
    ]
  );
  await q(
    `insert into cost_entries (work_order_id,vendor_id,category,description,amount,cost_date)
       values ($1,$2,'LABOR','Pulling unit day rate',$3,$4)`,
    [wo1.id, vPull, 4800, daysAgo(1).toISOString().slice(0, 10)]
  );

  const wo2 = await one(
    `insert into work_orders (title,status,priority,battery_id,assigned_to_id,created_by_id,vendor_id,due_date,est_cost)
       values ($1,'OPEN','MEDIUM',$2,$3,$4,$5,$6,$7) returning id`,
    [
      "Hot oil treat South Draw Battery",
      batteries[1].id,
      pumper,
      admin,
      vHot,
      daysAgo(-3),
      2500,
    ]
  );
  await q(
    `insert into action_items (work_order_id,text,owner_id,done) values ($1,$2,$3,false)`,
    [wo2.id, "Coordinate hot oil truck", pumper]
  );

  await one(
    `insert into work_orders (title,status,priority,well_id,created_by_id,vendor_id,est_cost)
       values ($1,'COMPLETED','HIGH',$2,$3,$4,$5) returning id`,
    ["Repair power drop", wells[5].id, admin, vElec, 1850]
  );
  await q(
    `insert into cost_entries (vendor_id,category,description,amount,cost_date)
       values ($1,'ELECTRICAL','Breaker + labor',$2,$3)`,
    [vElec, 1850, daysAgo(5).toISOString().slice(0, 10)]
  );

  console.log("\nSeed complete.");
  console.log("Login:");
  console.log(`  Admin:      ${adminEmail} / ${adminPw}`);
  console.log(`  Pumper:     pumper@lep.local / changeme123`);
  console.log(`  Manager RW: manager@lep.local / changeme123`);
  console.log(`  Exec RO:    exec@lep.local / changeme123`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

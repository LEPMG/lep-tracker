import Link from "next/link";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { PageHeader, EmptyState, StatCard } from "@/components/ui";
import { fmtDate, fmtNum } from "@/lib/format";
import {
  computeDailyProduction,
  type ReadingLite,
  type TankKind,
} from "@/lib/gauge";
import { addRunTicket } from "./actions";
import { GaugeEditor } from "./GaugeEditor";
import { LineChart, Sparkline, DateRange } from "./Charts";

export const dynamic = "force-dynamic";

function toISODate(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v.slice(0, 10);
  const d: Date = v;
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export default async function ProductionPage({
  searchParams,
}: {
  searchParams: { battery?: string; range?: string };
}) {
  const user = await getSessionUser();
  const canEdit = user!.role !== "MGMT_RO";

  const batteries = await query<{
    id: string;
    name: string;
    field: string;
    state: string;
  }>(
    `select id, name,
            coalesce(field,'') as field,
            coalesce(state,'') as state
       from batteries where active order by state, field, name`
  );

  const batteryId = searchParams.battery || batteries[0]?.id;

  if (!batteryId) {
    return (
      <div>
        <PageHeader title="Production" />
        <EmptyState
          title="No batteries set up yet"
          hint="Add a battery and its tanks under Wells & Batteries first."
        />
      </div>
    );
  }

  const [tanks, readingRows, tickets, downKpis, issues] = await Promise.all([
    query<{
      id: string;
      name: string;
      type: TankKind;
      bbls_per_inch: number;
      size_bbls: number | null;
    }>(
      `select id, name, type, bbls_per_inch, size_bbls
         from tanks where battery_id=$1 and active order by type, name`,
      [batteryId]
    ),
    query<any>(
      `select gr.id, gr.reading_date, gr.notes,
              tr.tank_id, tr.barrels, tr.feet, tr.inches,
              t.type as tank_type, t.name as tank_name
         from gauge_readings gr
         left join tank_readings tr on tr.gauge_reading_id = gr.id
         left join tanks t on t.id = tr.tank_id
        where gr.battery_id=$1
        order by gr.reading_date desc`,
      [batteryId]
    ),
    query<any>(
      `select * from run_tickets where battery_id=$1 order by ticket_date desc`,
      [batteryId]
    ),
    query<{ wells_down: number; oil_lost: number; gas_lost: number }>(
      `select count(*) as wells_down,
              coalesce(sum(test_oil_bopd),0) as oil_lost,
              coalesce(sum(test_gas_mcfd),0) as gas_lost
         from wells where battery_id=$1 and status='DOWN'`,
      [batteryId]
    ),
    query<any>(
      `select d.id, d.reason, d.est_bopd_loss, d.start_at,
              w.name as well_name
         from downtime_events d
         left join wells w on w.id = d.well_id
        where d.status='OPEN' and (d.battery_id=$1 or w.battery_id=$1)
        order by d.start_at asc
        limit 6`,
      [batteryId]
    ),
  ]);

  // ---- group reading rows by date ----
  const readMap = new Map<
    string,
    {
      date: string;
      notes: string | null;
      tanks: Record<
        string,
        { feet: number; inches: number; barrels: number; type: TankKind }
      >;
    }
  >();
  for (const r of readingRows) {
    const iso = toISODate(r.reading_date);
    if (!readMap.has(iso))
      readMap.set(iso, { date: iso, notes: r.notes, tanks: {} });
    if (r.tank_id != null && r.barrels != null)
      readMap.get(iso)!.tanks[r.tank_id] = {
        feet: Number(r.feet),
        inches: Number(r.inches),
        barrels: Number(r.barrels),
        type: r.tank_type,
      };
  }
  const readingsDesc = [...readMap.values()].sort((a, b) =>
    a.date < b.date ? 1 : -1
  );
  const readingsAsc = [...readingsDesc].reverse();

  // shape for the client editor (strip the type)
  const editorReadings = readingsDesc.map((r) => ({
    date: r.date,
    notes: r.notes,
    tanks: Object.fromEntries(
      Object.entries(r.tanks).map(([k, v]) => [
        k,
        { feet: v.feet, inches: v.inches, barrels: v.barrels },
      ])
    ),
  }));

  // ---- production periods (engine) ----
  const engineReadings: ReadingLite[] = readingsAsc.map((r) => ({
    date: new Date(r.date),
    tanks: Object.values(r.tanks).map((t) => ({
      type: t.type,
      barrels: t.barrels,
    })),
  }));
  const ticketLites = tickets.map((t: any) => ({
    date: new Date(toISODate(t.ticket_date)),
    type: t.type as "OIL_SALE" | "WATER_HAUL",
    gross: Number(t.gross_bbls),
    net: t.net_bbls != null ? Number(t.net_bbls) : null,
  }));
  const periodsAsc = computeDailyProduction(engineReadings, ticketLites);
  const latest = periodsAsc[periodsAsc.length - 1];

  // ---- date range filter ----
  const range = searchParams.range || "all";
  const now = new Date();
  const cutoff: Date | null =
    range === "7"
      ? new Date(now.getTime() - 7 * 864e5)
      : range === "30"
        ? new Date(now.getTime() - 30 * 864e5)
        : range === "90"
          ? new Date(now.getTime() - 90 * 864e5)
          : range === "month"
            ? new Date(now.getFullYear(), now.getMonth(), 1)
            : null;
  const inRange = (d: Date) => !cutoff || d.getTime() >= cutoff.getTime();

  const periodsShown = periodsAsc.filter((p) => inRange(p.toDate));
  const periodsDesc = [...periodsShown].reverse();
  const ticketsShown = tickets.filter((t: any) =>
    inRange(new Date(toISODate(t.ticket_date)))
  );

  const bopdSeries = periodsShown.map((p) => ({
    label: fmtShort(p.toDate),
    value: p.bopd,
  }));

  // ---- inventory (latest reading) ----
  const dk = downKpis[0];
  const latestReading = readingsDesc[0];
  const oilCap = tanks
    .filter((t) => t.type === "OIL" || t.type === "GAS_COND")
    .reduce((s, t) => s + Number(t.size_bbls || 0), 0);
  const waterCap = tanks
    .filter((t) => t.type === "WATER")
    .reduce((s, t) => s + Number(t.size_bbls || 0), 0);
  let oilOnHand = 0;
  let waterOnHand = 0;
  let hasWater = false;
  if (latestReading) {
    for (const t of tanks) {
      const tr = latestReading.tanks[t.id];
      if (!tr) continue;
      if (t.type === "WATER") {
        waterOnHand += tr.barrels;
        hasWater = true;
      } else {
        oilOnHand += tr.barrels;
      }
    }
  }
  const oilPct = oilCap ? Math.min(100, (oilOnHand / oilCap) * 100) : 0;
  const waterPct = waterCap ? Math.min(100, (waterOnHand / waterCap) * 100) : 0;
  const daysToFull =
    latest && latest.bopd > 0 && oilCap > oilOnHand
      ? (oilCap - oilOnHand) / latest.bopd
      : null;

  // ---- per-tank inventory trend (oil tanks with data) ----
  const tankSeries = tanks
    .filter((t) => t.type !== "WATER")
    .map((t) => {
      const series = readingsAsc
        .map((r) => r.tanks[t.id]?.barrels)
        .filter((v): v is number => v != null);
      const last = series[series.length - 1];
      const prev = series[series.length - 2];
      const change = last != null && prev != null ? last - prev : null;
      return { tank: t, series, last, change };
    })
    .filter((x) => x.series.length > 0);

  const today = toISODate(new Date());

  return (
    <div>
      <PageHeader
        title="Production"
        subtitle="Enter gauges, review and fix history, watch inventory and trends."
      />

      {/* battery selector */}
      <div className="mb-5 flex flex-wrap gap-2">
        {batteries.map((b) => (
          <Link
            key={b.id}
            href={`/production?battery=${b.id}`}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              b.id === batteryId
                ? "bg-brand-600 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {b.name}
          </Link>
        ))}
      </div>

      {/* KPI row */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Latest BOPD"
          value={latest ? fmtNum(latest.bopd, 1) : "—"}
          tone="good"
          sub={latest ? `as of ${fmtDate(latest.toDate)}` : undefined}
        />
        <StatCard
          label="Wells Down"
          value={String(dk?.wells_down ?? 0)}
          tone={Number(dk?.wells_down) > 0 ? "danger" : "default"}
          sub={
            Number(dk?.oil_lost) > 0
              ? `−${fmtNum(Number(dk.oil_lost), 0)} BOPD est.`
              : undefined
          }
        />
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Oil on hand
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
            {latestReading ? fmtNum(oilOnHand, 0) : "—"}
          </div>
          <div className="mt-0.5 text-xs text-slate-400">
            {oilCap ? `of ${fmtNum(oilCap, 0)} bbl · ${Math.round(oilPct)}% full` : "no tank sizes set"}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded bg-slate-100">
            <div
              className="h-full rounded bg-brand-600"
              style={{ width: `${oilPct}%` }}
            />
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Water on hand
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
            {hasWater ? fmtNum(waterOnHand, 0) : "—"}
          </div>
          <div className="mt-0.5 text-xs text-slate-400">
            {hasWater
              ? waterCap
                ? `of ${fmtNum(waterCap, 0)} bbl · ${Math.round(waterPct)}% full`
                : ""
              : "water tanks not gauged yet"}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded bg-slate-100">
            <div
              className="h-full rounded bg-sky-600"
              style={{ width: `${waterPct}%` }}
            />
          </div>
        </div>
      </div>

      {daysToFull != null && (
        <div className="mb-6 rounded-xl border border-dashed border-slate-200 bg-white p-3 text-sm text-slate-600">
          <b>Call-a-load helper:</b> at the recent{" "}
          {fmtNum(latest!.bopd, 1)} BOPD, oil reaches full (
          {fmtNum(oilCap, 0)} bbl) in about{" "}
          <b>{Math.round(daysToFull)} days</b> — the cue to schedule the truck.
        </div>
      )}

      {/* open issues (read-only, from Downtime) */}
      {issues.length > 0 && (
        <div className="mb-6">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            Open issues affecting this battery
          </div>
          <div className="card divide-y divide-slate-100">
            {issues.map((d: any) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5"
              >
                <span className="h-2.5 w-2.5 flex-none rounded-full bg-red-500" />
                <span className="flex-1 text-sm">
                  {d.well_name ? `${d.well_name} — ` : ""}
                  {d.reason}
                </span>
                <span className="text-xs tabular-nums text-slate-500">
                  {d.est_bopd_loss ? `−${fmtNum(Number(d.est_bopd_loss), 0)} BOPD · ` : ""}
                  open {daysOpen(d.start_at)}d
                </span>
                <Link
                  href="/downtime"
                  className="text-xs font-semibold text-brand-600"
                >
                  Downtime ›
                </Link>
              </div>
            ))}
            <div className="px-4 py-2 text-xs text-slate-400">
              Read-only here — these live in Downtime / Work Orders.
            </div>
          </div>
        </div>
      )}

      {tanks.length === 0 ? (
        <EmptyState
          title="This battery has no tanks yet"
          hint="Add tanks (with bbls/inch) under Wells & Batteries to gauge production."
        />
      ) : (
        <>
          {/* gauge entry + history */}
          {canEdit && (
            <>
              <SectionLabel>Enter or edit tank gauges</SectionLabel>
              <GaugeEditor
                batteryId={batteryId}
                tanks={tanks.map((t) => ({
                  id: t.id,
                  name: t.name,
                  type: t.type,
                  bbls_per_inch: Number(t.bbls_per_inch),
                }))}
                readings={editorReadings}
                today={today}
              />
            </>
          )}

          {/* run tickets */}
          <SectionLabel>Oil run tickets (loads hauled)</SectionLabel>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {canEdit && (
              <div className="card p-4">
                <h3 className="mb-1 font-semibold">Log a run ticket</h3>
                <p className="mb-3 text-xs text-slate-400">
                  When a truck hauls oil — this feeds the tank drawdown so
                  production still balances.
                </p>
                <form action={addRunTicket} className="space-y-3">
                  <input type="hidden" name="battery_id" value={batteryId} />
                  <input type="hidden" name="type" value="OIL_SALE" />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label">Date</label>
                      <input
                        name="ticket_date"
                        type="date"
                        className="input"
                        defaultValue={today}
                        required
                      />
                    </div>
                    <div>
                      <label className="label">Ticket #</label>
                      <input name="ticket_number" className="input" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label">Gross bbls *</label>
                      <input
                        name="gross_bbls"
                        type="number"
                        step="any"
                        inputMode="decimal"
                        className="input"
                        required
                      />
                    </div>
                    <div>
                      <label className="label">Net bbls</label>
                      <input
                        name="net_bbls"
                        type="number"
                        step="any"
                        inputMode="decimal"
                        className="input"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label">Gravity °API</label>
                      <input
                        name="gravity_api"
                        type="number"
                        step="any"
                        inputMode="decimal"
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">BS&amp;W %</label>
                      <input
                        name="bsw"
                        type="number"
                        step="any"
                        inputMode="decimal"
                        className="input"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label">Hauler / purchaser</label>
                    <input name="hauler" className="input" />
                  </div>
                  <button className="btn-primary w-full">Save run ticket</button>
                </form>
              </div>
            )}

            <div className="card p-4">
              <h3 className="mb-2 font-semibold">Run ticket history</h3>
              {ticketsShown.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  No run tickets in this range.
                </p>
              ) : (
                <div className="max-h-[340px] overflow-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-white">
                      <tr>
                        <th className="th">Date</th>
                        <th className="th">Ticket</th>
                        <th className="th">Hauler</th>
                        <th className="th text-right">Gross</th>
                        <th className="th text-right">Net</th>
                        <th className="th text-right">°API</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ticketsShown.map((t: any) => (
                        <tr key={t.id} className="border-b border-slate-50">
                          <td className="td whitespace-nowrap">
                            {fmtDate(t.ticket_date)}
                          </td>
                          <td className="td">{t.ticket_number || "—"}</td>
                          <td className="td">{t.hauler || "—"}</td>
                          <td className="td text-right tabular-nums">
                            {fmtNum(t.gross_bbls, 1)}
                          </td>
                          <td className="td text-right tabular-nums">
                            {fmtNum(Number(t.net_bbls ?? t.gross_bbls), 1)}
                          </td>
                          <td className="td text-right tabular-nums">
                            {t.gravity_api ? fmtNum(t.gravity_api, 0) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* tank inventory & trend */}
          {tankSeries.length > 0 && (
            <>
              <SectionLabel>Tank inventory &amp; trend</SectionLabel>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {tankSeries.map(({ tank, series, last, change }) => (
                  <div key={tank.id} className="card p-4">
                    <div className="font-bold">{tank.name}</div>
                    <div className="text-2xl font-bold tabular-nums">
                      {fmtNum(last, 1)}{" "}
                      <span className="text-xs font-semibold text-slate-400">
                        bbl
                      </span>
                    </div>
                    {change != null && (
                      <div
                        className={`text-xs font-bold tabular-nums ${
                          change >= 0 ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {change >= 0 ? "▲" : "▼"} {fmtNum(Math.abs(change), 1)}{" "}
                        since last gauge
                      </div>
                    )}
                    <Sparkline values={series} />
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-400">
                Tanks are equalized, so oil moves between them — the useful read
                here is inventory per tank, with battery BOPD below as the true
                production number.
              </p>
            </>
          )}

          {/* computed production trend */}
          <SectionLabel>Computed production trend (BOPD)</SectionLabel>
          <div className="card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-500">
                {periodsShown.length} day
                {periodsShown.length === 1 ? "" : "s"} shown
              </span>
              <DateRange batteryId={batteryId} range={range} />
            </div>
            <LineChart points={bopdSeries} unit=" BOPD" />
          </div>

          {/* daily table */}
          <h3 className="mb-3 mt-6 text-base font-semibold">
            Daily production (exact)
          </h3>
          {periodsDesc.length === 0 ? (
            <EmptyState
              title="Need at least two gaugings"
              hint="Production is computed from the change between consecutive gauge readings."
            />
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="th">Period</th>
                    <th className="th">Days</th>
                    <th className="th text-right">Oil made</th>
                    <th className="th text-right">Oil sold</th>
                    <th className="th text-right">BOPD</th>
                    <th className="th text-right">BWPD</th>
                  </tr>
                </thead>
                <tbody>
                  {periodsDesc.map((p, i) => (
                    <tr key={i} className="border-b border-slate-50">
                      <td className="td whitespace-nowrap">
                        {fmtDate(p.fromDate)} → {fmtDate(p.toDate)}
                      </td>
                      <td className="td">{p.days}</td>
                      <td className="td text-right tabular-nums">
                        {fmtNum(p.oilProducedBbls, 1)}
                      </td>
                      <td className="td text-right tabular-nums">
                        {fmtNum(p.oilSoldBbls, 1)}
                      </td>
                      <td className="td text-right font-semibold tabular-nums text-emerald-700">
                        {fmtNum(p.bopd, 1)}
                      </td>
                      <td className="td text-right font-semibold tabular-nums text-blue-700">
                        {fmtNum(p.bwpd, 1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 mt-8 text-xs font-bold uppercase tracking-wide text-slate-500">
      {children}
    </div>
  );
}

function fmtShort(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysOpen(start: any): number {
  const s = new Date(start).getTime();
  return Math.max(0, Math.round((Date.now() - s) / 864e5));
}

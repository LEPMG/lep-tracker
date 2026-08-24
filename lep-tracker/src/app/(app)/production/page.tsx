import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { PageHeader, Badge, EmptyState, StatCard } from "@/components/ui";
import { fmtDate, fmtNum, fmtMoney } from "@/lib/format";
import {
  computeDailyProduction,
  type ReadingLite,
  type TankKind,
} from "@/lib/gauge";
import { saveGaugeReading, addRunTicket } from "./actions";
import { ProductionPicker } from "./ProductionPicker";
import { DateRange } from "./DateRange";
import { GasMeters } from "./GasMeters";
import { TrendChart, type TrendPoint } from "./TrendChart";

export const dynamic = "force-dynamic";

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
            coalesce(field, 'Unassigned') as field,
            coalesce(state, '')          as state
       from batteries
      where active
      order by state, field, name`,
  );

  const range = searchParams.range || "all";
  // An unknown battery id falls back to the first one rather than rendering a
  // page of empty states for a battery that isn't there.
  const batteryId =
    searchParams.battery && batteries.some((b) => b.id === searchParams.battery)
      ? searchParams.battery
      : batteries[0]?.id;

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

  const [tanks, readingRows, tickets, downRows] = await Promise.all([
    query<any>(
      `select id, name, type, bbls_per_inch from tanks
        where battery_id=$1 and active order by type, name`,
      [batteryId],
    ),
    query<any>(
      `select gr.id, gr.reading_date, gr.notes, u.name as gauged_by,
              tr.barrels, tr.feet, tr.inches, t.type as tank_type, t.name as tank_name
         from gauge_readings gr
         left join users u on u.id = gr.gauged_by_id
         left join tank_readings tr on tr.gauge_reading_id = gr.id
         left join tanks t on t.id = tr.tank_id
        where gr.battery_id=$1
        order by gr.reading_date desc`,
      [batteryId],
    ),
    query<any>(
      `select * from run_tickets where battery_id=$1 order by ticket_date desc`,
      [batteryId],
    ),
    /**
     * Down-well KPIs for this battery, matching Down Wells / Dashboard: a well
     * counts as down while it has an OPEN downtime event. Deduped to distinct
     * wells first — two open events on one well is one well down, and its test
     * rates must not be counted twice.
     */
    query<{ wells_down: number; oil_lost: number; gas_lost: number }>(
      `select count(*)::int as wells_down,
              coalesce(sum(test_oil_bopd), 0) as oil_lost,
              coalesce(sum(test_gas_mcfd), 0) as gas_lost
         from (
           select distinct w.id, w.test_oil_bopd, w.test_gas_mcfd
             from downtime_events d
             join wells w on w.id = d.well_id
            where d.status = 'OPEN' and w.battery_id = $1
         ) down_wells`,
      [batteryId],
    ),
  ]);

  // Group reading rows into per-date readings for the engine
  const byReading = new Map<
    string,
    { date: Date; tanks: { type: TankKind; barrels: number }[] }
  >();
  for (const r of readingRows) {
    if (!byReading.has(r.id))
      byReading.set(r.id, { date: new Date(r.reading_date), tanks: [] });
    if (r.tank_type != null && r.barrels != null)
      byReading
        .get(r.id)!
        .tanks.push({ type: r.tank_type, barrels: Number(r.barrels) });
  }
  const readings: ReadingLite[] = [...byReading.values()];
  const ticketLites = tickets.map((t: any) => ({
    date: new Date(t.ticket_date),
    type: t.type as "OIL_SALE" | "WATER_HAUL",
    gross: Number(t.gross_bbls),
    net: t.net_bbls != null ? Number(t.net_bbls) : null,
  }));

  const periods = computeDailyProduction(readings, ticketLites).sort(
    (a, b) => b.toDate.getTime() - a.toDate.getTime(),
  );
  const latest = periods[0];

  // Periods are always computed from the full history — a period needs the
  // gauge *before* the window to exist at all — then trimmed for display.
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
            : null; // "all"

  const periodsShown = periods.filter(
    (p) => !cutoff || p.toDate.getTime() >= cutoff.getTime(),
  );
  const ticketsShown = tickets.filter(
    (t: any) =>
      !cutoff || new Date(t.ticket_date).getTime() >= cutoff.getTime(),
  );

  // chart reads left-to-right, oldest first
  const trend: TrendPoint[] = [...periodsShown]
    .reverse()
    .map((p) => ({ date: p.toDate, bopd: p.bopd, bwpd: p.bwpd }));

  const down = downRows[0];
  const wellsDown = Number(down?.wells_down ?? 0);
  const oilLost = Number(down?.oil_lost ?? 0);
  const gasLost = Number(down?.gas_lost ?? 0);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader
        title="Production"
        subtitle="Enter tank gauges — the app converts to barrels and computes BOPD / BWPD automatically."
      />

      {/* battery selector */}
      <ProductionPicker
        batteries={batteries}
        selectedId={batteryId}
        range={range}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Latest BOPD"
          value={latest ? fmtNum(latest.bopd, 1) : "—"}
          tone="good"
          sub={latest ? `as of ${fmtDate(latest.toDate)}` : undefined}
        />
        <StatCard
          label="Wells Down"
          value={wellsDown}
          tone={wellsDown > 0 ? "danger" : undefined}
          sub="open downtime events"
          href="/downtime"
        />
        <StatCard
          label="Oil Lost (BOPD)"
          value={fmtNum(oilLost, 0)}
          tone={oilLost > 0 ? "warn" : undefined}
          sub="from well tests"
          href="/downtime"
        />
        <StatCard
          label="Gas Lost (MCFD)"
          value={fmtNum(gasLost, 0)}
          tone={gasLost > 0 ? "warn" : undefined}
          sub="from well tests"
          href="/downtime"
        />
      </div>

      {tanks.length === 0 ? (
        <EmptyState
          title="This battery has no tanks yet"
          hint="Add tanks (with bbls/inch) under Wells & Batteries to gauge production."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Gauge entry */}
          {canEdit && (
            <div className="card p-4">
              <h2 className="mb-1 font-semibold">Enter Tank Gauges</h2>
              <p className="mb-3 text-xs text-slate-400">
                Gauge each tank in feet + inches. Barrels are computed from the
                tank&apos;s bbls/inch factor.
              </p>
              <form action={saveGaugeReading} className="space-y-3">
                <input type="hidden" name="battery_id" value={batteryId} />
                <div>
                  <label className="label">Reading date</label>
                  <input
                    name="reading_date"
                    type="date"
                    className="input"
                    defaultValue={today}
                    required
                  />
                </div>
                <div className="space-y-2">
                  {tanks.map((t: any) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 rounded-md border border-slate-100 p-2"
                    >
                      <div className="flex-1">
                        <div className="text-sm font-medium">{t.name}</div>
                        <div className="text-xs text-slate-400">
                          <Badge value={t.type} /> {fmtNum(t.bbls_per_inch, 3)}{" "}
                          bbl/in
                        </div>
                      </div>
                      <div className="w-16">
                        <label className="label">Feet</label>
                        <input
                          name={`feet_${t.id}`}
                          type="number"
                          min="0"
                          className="input !py-1"
                          defaultValue="0"
                        />
                      </div>
                      <div className="w-20">
                        <label className="label">Inches</label>
                        <input
                          name={`inches_${t.id}`}
                          type="number"
                          step="any"
                          min="0"
                          className="input !py-1"
                          defaultValue="0"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div>
                  <label className="label">Notes</label>
                  <input name="notes" className="input" />
                </div>
                <button className="btn-primary w-full">Save gauges</button>
              </form>
            </div>
          )}

          {/* Run ticket entry + gas meters share the right-hand column */}
          {canEdit && (
            <div className="flex flex-col gap-6">
              <div className="card h-fit p-4">
                <h2 className="mb-1 font-semibold">
                  Log Run Ticket (Oil Sale / Water Haul)
                </h2>
                <p className="mb-3 text-xs text-slate-400">
                  Oil sales feed revenue and reconcile against tank drawdown.
                </p>
                <form action={addRunTicket} className="space-y-3">
                  <input type="hidden" name="battery_id" value={batteryId} />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label">Type</label>
                      <select name="type" className="input">
                        <option value="OIL_SALE">Oil sale</option>
                        <option value="WATER_HAUL">Water haul</option>
                      </select>
                    </div>
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
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label">Gross bbls *</label>
                      <input
                        name="gross_bbls"
                        type="number"
                        step="any"
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
                        className="input"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="label">BS&amp;W %</label>
                      <input
                        name="bsw"
                        type="number"
                        step="any"
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">Gravity</label>
                      <input
                        name="gravity_api"
                        type="number"
                        step="any"
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">$/bbl</label>
                      <input
                        name="price_per_bbl"
                        type="number"
                        step="any"
                        className="input"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label">Ticket #</label>
                      <input name="ticket_number" className="input" />
                    </div>
                    <div>
                      <label className="label">Hauler / Purchaser</label>
                      <input name="hauler" className="input" />
                    </div>
                  </div>
                  <button className="btn-primary w-full">
                    Save run ticket
                  </button>
                </form>
              </div>

              {/* Gas meters — UI placeholder, no data model yet */}
              <GasMeters />
            </div>
          )}
        </div>
      )}

      <div className="mb-3 mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          Computed Production (BOPD / BWPD)
        </h2>
        <DateRange batteryId={batteryId} range={range} />
      </div>

      {/* Trend over the same range as the table below */}
      {trend.length >= 2 && <TrendChart points={trend} />}

      {periods.length > 0 && (
        <div className="mb-3 mt-6 text-xs text-slate-400">
          {periodsShown.length} of {periods.length} periods
        </div>
      )}

      {periodsShown.length === 0 ? (
        <EmptyState
          title={
            periods.length === 0
              ? "Need at least two gaugings"
              : "No periods in this range"
          }
          hint={
            periods.length === 0
              ? "Production is computed from the change between consecutive gauge readings."
              : "Widen the range above to see earlier periods."
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="th">Period</th>
                <th className="th">Days</th>
                <th className="th text-right">Oil made (bbls)</th>
                <th className="th text-right">Oil sold (bbls)</th>
                <th className="th text-right">BOPD</th>
                <th className="th text-right">BWPD</th>
              </tr>
            </thead>
            <tbody>
              {periodsShown.map((p, i) => (
                <tr key={i} className="border-b border-slate-50">
                  <td className="td">
                    {fmtDate(p.fromDate)} → {fmtDate(p.toDate)}
                  </td>
                  <td className="td">{p.days}</td>
                  <td className="td text-right">
                    {fmtNum(p.oilProducedBbls, 1)}
                  </td>
                  <td className="td text-right">{fmtNum(p.oilSoldBbls, 1)}</td>
                  <td className="td text-right font-semibold text-emerald-700">
                    {fmtNum(p.bopd, 1)}
                  </td>
                  <td className="td text-right font-semibold text-blue-700">
                    {fmtNum(p.bwpd, 1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Oil sales */}
      <h2 className="mb-3 mt-8 text-lg font-semibold">Oil Sales & Hauls</h2>
      {ticketsShown.length === 0 ? (
        <EmptyState
          title={
            tickets.length === 0
              ? "No run tickets yet"
              : "No run tickets in this range"
          }
          hint={
            tickets.length === 0
              ? undefined
              : "Widen the range to see earlier tickets."
          }
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="th">Date</th>
                <th className="th">Type</th>
                <th className="th">Ticket #</th>
                <th className="th">Hauler</th>
                <th className="th text-right">Gross</th>
                <th className="th text-right">Net</th>
                <th className="th text-right">$/bbl</th>
                <th className="th text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {ticketsShown.map((t: any) => {
                const net = Number(t.net_bbls ?? t.gross_bbls);
                const value = net * Number(t.price_per_bbl || 0);
                return (
                  <tr key={t.id} className="border-b border-slate-50">
                    <td className="td">{fmtDate(t.ticket_date)}</td>
                    <td className="td">
                      <Badge
                        value={t.type === "OIL_SALE" ? "COMPLETED" : "ON_HOLD"}
                      />
                      <span className="ml-1 text-xs">
                        {t.type === "OIL_SALE" ? "Oil" : "Water"}
                      </span>
                    </td>
                    <td className="td">{t.ticket_number || "—"}</td>
                    <td className="td">{t.hauler || "—"}</td>
                    <td className="td text-right">{fmtNum(t.gross_bbls, 1)}</td>
                    <td className="td text-right">{fmtNum(net, 1)}</td>
                    <td className="td text-right">
                      {t.price_per_bbl ? fmtMoney(t.price_per_bbl) : "—"}
                    </td>
                    <td className="td text-right font-semibold">
                      {t.price_per_bbl ? fmtMoney(value) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

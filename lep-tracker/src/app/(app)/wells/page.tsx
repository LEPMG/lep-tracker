import Link from "next/link";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canManage } from "@/lib/permissions";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { fmtNum } from "@/lib/format";
import {
  createBattery,
  createWell,
  createTank,
  setWellStatus,
  setWellTest,
} from "./actions";
import { PageFilters, type FilterRow } from "@/components/Filters";

export const dynamic = "force-dynamic";

interface BatteryRow {
  id: string;
  name: string;
  code: string | null;
  field: string | null;
  county: string | null;
  state: string | null;
}
interface TankRow {
  id: string;
  battery_id: string;
  name: string;
  type: string;
  size_bbls: number | null;
  bbls_per_inch: number;
}
interface WellRow {
  id: string;
  name: string;
  api_number: string | null;
  status: string;
  battery_name: string | null;
  field: string | null;
  county: string | null;
  state: string | null;
  test_oil_bopd: number | null;
  test_water_bwpd: number | null;
  test_gas_mcfd: number | null;
}

export default async function WellsPage({
  searchParams,
}: {
  searchParams: {
    state?: string;
    county?: string;
    field?: string;
    battery?: string;
  };
}) {
  const user = await getSessionUser();
  const manage = canManage(user!.role);

  const fState = searchParams.state || "";
  const fCounty = searchParams.county || "";
  const fField = searchParams.field || "";
  const fBattery = searchParams.battery || "";

  /**
   * The same four filters drive both sections, so each query builds its own
   * where-clause off the shared values. `col` names the table alias/column the
   * dimension lives on for that query.
   */
  function buildWhere(cols: {
    state: string;
    county: string;
    field: string;
    battery: string;
  }) {
    const conds: string[] = [];
    const params: any[] = [];
    const add = (col: string, val: string) => {
      if (!val) return;
      params.push(val);
      conds.push(`${col} = $${params.length}`);
    };
    add(cols.state, fState);
    add(cols.county, fCounty);
    add(cols.field, fField);
    add(cols.battery, fBattery);
    return {
      where: conds.length ? `where ${conds.join(" and ")}` : "",
      params,
    };
  }

  const bat = buildWhere({
    state: "state",
    county: "county",
    field: "field",
    battery: "name",
  });
  const wel = buildWhere({
    state: "w.state",
    county: "w.county",
    field: "w.field",
    battery: "b.name",
  });

  const hasFilter = !!(fState || fCounty || fField || fBattery);

  // UP first, then DOWN, SHUT_IN, and INACTIVE last.
  const statusOrder = `case w.status
      when 'UP' then 0 when 'DOWN' then 1 when 'SHUT_IN' then 2 else 3 end`;

  const [batteries, allBatteries, tanks, wells, filterRows] = await Promise.all([
    // grouped by state, so one state's batteries stay together
    query<BatteryRow>(
      `select * from batteries ${bat.where}
        order by state, field, name`,
      bat.params
    ),
    // unfiltered — the "Add Well" battery dropdown must always offer them all
    query<BatteryRow>(`select * from batteries order by state, field, name`),
    query<TankRow>(`select * from tanks where active order by name`),
    query<WellRow>(
      `select w.*, b.name as battery_name from wells w
         left join batteries b on b.id = w.battery_id
        ${wel.where}
        order by w.state, w.field, b.name, ${statusOrder}, w.name`,
      wel.params
    ),
    // options come from the union of both sections' data
    query<FilterRow>(
      `select distinct w.state, w.county, w.field, b.name as battery
         from wells w left join batteries b on b.id = w.battery_id
       union
       select distinct state, county, field, name as battery from batteries`
    ),
  ]);

  return (
    <div>
      <PageHeader
        title="Wells & Batteries"
        subtitle="Master list of every location. Tanks (with bbls/inch) power the production module."
        action={
          manage && (
            <Link href="/wells/import" className="btn-ghost">
              ↑ Bulk Import
            </Link>
          )
        }
      />

      {/* One filter, both sections */}
      <PageFilters
        basePath="/wells"
        rows={filterRows}
        state={fState}
        county={fCounty}
        field={fField}
        battery={fBattery}
      />

      {/* Batteries + tanks */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Batteries & Tanks{" "}
            <span className="ml-1 text-xs font-normal text-slate-400">
              {batteries.length} shown
            </span>
          </h2>
          {manage && (
            <details className="relative">
              <summary className="btn-primary cursor-pointer list-none">
                + Add Battery
              </summary>
              <form
                action={createBattery}
                className="card absolute right-0 z-10 mt-2 w-80 space-y-3 p-4"
              >
                <div>
                  <label className="label">Battery name *</label>
                  <input name="name" className="input" required />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">Code</label>
                    <input name="code" className="input" />
                  </div>
                  <div>
                    <label className="label">Field / Lease</label>
                    <input name="field" className="input" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">County</label>
                    <input name="county" className="input" />
                  </div>
                  <div>
                    <label className="label">State</label>
                    <input name="state" className="input" />
                  </div>
                </div>
                <button className="btn-primary w-full">Save battery</button>
              </form>
            </details>
          )}
        </div>

        {batteries.length === 0 ? (
          <EmptyState
            title={
              hasFilter
                ? "No batteries match these filters"
                : "No batteries yet"
            }
            hint={
              !hasFilter && manage
                ? "Add your first battery to begin."
                : undefined
            }
          />
        ) : (
          <div className="space-y-4">
            {batteries.map((b) => {
              const bTanks = tanks.filter((t) => t.battery_id === b.id);
              return (
                <div key={b.id} className="card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-900">
                        {b.name}{" "}
                        {b.code && (
                          <span className="text-xs text-slate-400">
                            ({b.code})
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400">
                        {[b.field, b.county, b.state]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </div>
                    </div>
                    {manage && (
                      <details className="relative">
                        <summary className="btn-ghost cursor-pointer list-none text-xs">
                          + Tank
                        </summary>
                        <form
                          action={createTank}
                          className="card absolute right-0 z-10 mt-2 w-72 space-y-3 p-4"
                        >
                          <input
                            type="hidden"
                            name="battery_id"
                            value={b.id}
                          />
                          <div>
                            <label className="label">Tank name *</label>
                            <input
                              name="name"
                              className="input"
                              placeholder="Oil Tank #1"
                              required
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="label">Type</label>
                              <select name="type" className="input">
                                <option value="OIL">Oil</option>
                                <option value="WATER">Water</option>
                                <option value="GAS_COND">Condensate</option>
                              </select>
                            </div>
                            <div>
                              <label className="label">Size (bbls)</label>
                              <input
                                name="size_bbls"
                                type="number"
                                step="any"
                                className="input"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="label">Bbls per inch *</label>
                            <input
                              name="bbls_per_inch"
                              type="number"
                              step="any"
                              className="input"
                              placeholder="1.87"
                              required
                            />
                          </div>
                          <button className="btn-primary w-full">
                            Save tank
                          </button>
                        </form>
                      </details>
                    )}
                  </div>

                  {bTanks.length > 0 && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className="th">Tank</th>
                            <th className="th">Type</th>
                            <th className="th">Size (bbls)</th>
                            <th className="th">Bbls / inch</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bTanks.map((t) => (
                            <tr
                              key={t.id}
                              className="border-b border-slate-50"
                            >
                              <td className="td font-medium">{t.name}</td>
                              <td className="td">
                                <Badge value={t.type} />
                              </td>
                              <td className="td">{fmtNum(t.size_bbls, 0)}</td>
                              <td className="td">{fmtNum(t.bbls_per_inch, 3)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Wells */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Wells{" "}
            <span className="ml-1 text-xs font-normal text-slate-400">
              {wells.length} shown
            </span>
          </h2>
          {manage && (
            <details className="relative">
              <summary className="btn-primary cursor-pointer list-none">
                + Add Well
              </summary>
              <form
                action={createWell}
                className="card absolute right-0 z-10 mt-2 w-80 space-y-3 p-4"
              >
                <div>
                  <label className="label">Well name *</label>
                  <input name="name" className="input" required />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">API #</label>
                    <input name="api_number" className="input" />
                  </div>
                  <div>
                    <label className="label">Status</label>
                    <select name="status" className="input">
                      <option value="UP">Up</option>
                      <option value="DOWN">Down</option>
                      <option value="SHUT_IN">Shut-in</option>
                      <option value="INACTIVE">Inactive</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label">Battery</label>
                  <select name="battery_id" className="input">
                    <option value="">— none —</option>
                    {allBatteries.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="label">Field</label>
                    <input name="field" className="input" />
                  </div>
                  <div>
                    <label className="label">County</label>
                    <input name="county" className="input" />
                  </div>
                  <div>
                    <label className="label">State</label>
                    <input name="state" className="input" />
                  </div>
                </div>
                <div>
                  <label className="label">
                    Well test (used to auto-estimate downtime loss)
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    <input
                      name="test_oil_bopd"
                      type="number"
                      step="any"
                      className="input"
                      placeholder="Oil BOPD"
                    />
                    <input
                      name="test_water_bwpd"
                      type="number"
                      step="any"
                      className="input"
                      placeholder="Water BWPD"
                    />
                    <input
                      name="test_gas_mcfd"
                      type="number"
                      step="any"
                      className="input"
                      placeholder="Gas MCFD"
                    />
                    <input
                      name="test_date"
                      type="date"
                      className="input"
                      title="Test date"
                    />
                  </div>
                </div>
                <button className="btn-primary w-full">Save well</button>
              </form>
            </details>
          )}
        </div>

        {wells.length === 0 ? (
          <EmptyState title="No wells match these filters" />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="th">Well</th>
                  <th className="th">API #</th>
                  <th className="th">Battery</th>
                  <th className="th">Field</th>
                  <th className="th">State</th>
                  <th className="th" title="Well test: oil rate">
                    Oil (BOPD)
                  </th>
                  <th className="th" title="Well test: water rate">
                    Water (BWPD)
                  </th>
                  <th className="th" title="Well test: gas rate">
                    Gas (MCFD)
                  </th>
                  <th className="th">Status</th>
                  {user!.role !== "MGMT_RO" && <th className="th">Set status</th>}
                </tr>
              </thead>
              <tbody>
                {wells.map((w) => (
                  <tr key={w.id} className="border-b border-slate-50">
                    <td className="td font-medium">{w.name}</td>
                    <td className="td">{w.api_number || "—"}</td>
                    <td className="td">{w.battery_name || "—"}</td>
                    <td className="td">{w.field || "—"}</td>
                    <td className="td">{w.state || "—"}</td>
                    <TestRateCell well={w} value={w.test_oil_bopd} manage={manage} />
                    <TestRateCell well={w} value={w.test_water_bwpd} manage={manage} />
                    <TestRateCell well={w} value={w.test_gas_mcfd} manage={manage} />
                    <td className="td">
                      <Badge value={w.status} />
                    </td>
                    {user!.role !== "MGMT_RO" && (
                      <td className="td">
                        <form action={setWellStatus} className="flex gap-1">
                          <input type="hidden" name="id" value={w.id} />
                          <select
                            name="status"
                            defaultValue={w.status}
                            className="input !py-1 !text-xs"
                          >
                            <option value="UP">Up</option>
                            <option value="DOWN">Down</option>
                            <option value="SHUT_IN">Shut-in</option>
                            <option value="INACTIVE">Inactive</option>
                          </select>
                          <button className="btn-ghost !py-1 !text-xs">
                            Save
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function TestRateCell({
  well,
  value,
  manage,
}: {
  well: WellRow;
  value: number | null;
  manage: boolean;
}) {
  const text = fmtNum(value, 0);
  if (!manage) {
    return (
      <td className="td whitespace-nowrap">
        <span className="text-xs text-slate-600">{text}</span>
      </td>
    );
  }
  return (
    <td className="td whitespace-nowrap">
      <details className="relative">
        <summary className="cursor-pointer list-none text-xs text-slate-600">
          {text}
        </summary>
        <form
          action={setWellTest}
          className="card absolute left-0 z-10 mt-2 w-64 space-y-2 p-3"
        >
          <input type="hidden" name="id" value={well.id} />
          <div className="text-xs font-semibold text-slate-500">
            Well test rates
          </div>
          <div className="grid grid-cols-3 gap-1">
            <input
              name="test_oil_bopd"
              type="number"
              step="any"
              className="input !py-1 !text-xs"
              placeholder="Oil"
              defaultValue={well.test_oil_bopd ?? ""}
            />
            <input
              name="test_water_bwpd"
              type="number"
              step="any"
              className="input !py-1 !text-xs"
              placeholder="Water"
              defaultValue={well.test_water_bwpd ?? ""}
            />
            <input
              name="test_gas_mcfd"
              type="number"
              step="any"
              className="input !py-1 !text-xs"
              placeholder="Gas"
              defaultValue={well.test_gas_mcfd ?? ""}
            />
          </div>
          <input
            name="test_date"
            type="date"
            className="input !py-1 !text-xs"
            title="Test date"
          />
          <button className="btn-primary w-full !py-1 !text-xs">
            Save test
          </button>
        </form>
      </details>
    </td>
  );
}

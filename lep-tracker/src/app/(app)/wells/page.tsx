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
import { WellFilters } from "@/components/Filters";

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
  state: string | null;
  test_oil_bopd: number | null;
  test_water_bwpd: number | null;
  test_gas_mcfd: number | null;
}

export default async function WellsPage({
  searchParams,
}: {
  searchParams: { state?: string; field?: string };
}) {
  const user = await getSessionUser();
  const manage = canManage(user!.role);

  const fState = searchParams.state || "";
  const fField = searchParams.field || "";
  const conds: string[] = [];
  const params: any[] = [];
  if (fState) {
    params.push(fState);
    conds.push(`w.state = $${params.length}`);
  }
  if (fField) {
    params.push(fField);
    conds.push(`w.field = $${params.length}`);
  }
  const where = conds.length ? `where ${conds.join(" and ")}` : "";

  const [batteries, tanks, wells, states, fields] = await Promise.all([
    query<BatteryRow>(`select * from batteries order by name`),
    query<TankRow>(`select * from tanks where active order by name`),
    query<WellRow>(
      `select w.*, b.name as battery_name from wells w
         left join batteries b on b.id = w.battery_id
        ${where}
        order by w.name`,
      params
    ),
    query<{ v: string }>(
      `select distinct state as v from wells where state is not null and state <> '' order by state`
    ),
    query<{ v: string }>(
      `select distinct field as v from wells where field is not null and field <> '' order by field`
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

      {/* Batteries + tanks */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Batteries & Tanks</h2>
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
            title="No batteries yet"
            hint={manage ? "Add your first battery to begin." : undefined}
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
          <h2 className="text-lg font-semibold">Wells</h2>
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
                    {batteries.map((b) => (
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

        <WellFilters
          basePath="/wells"
          states={states.map((s) => s.v)}
          fields={fields.map((f) => f.v)}
          state={fState}
          field={fField}
          count={wells.length}
        />

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

import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { PageHeader, Badge, EmptyState, StatCard } from "@/components/ui";
import { fmtDateTime, durationSince, fmtNum } from "@/lib/format";
import { PageFilters, type FilterRow } from "@/components/Filters";
import ReportDownForm from "./ReportDownForm";
import { reportDowntime, resolveDowntime } from "./actions";

export const dynamic = "force-dynamic";

interface DownRow {
  id: string;
  reason: string;
  category: string | null;
  start_at: string;
  end_at: string | null;
  status: string;
  est_bopd_loss: number | null;
  well_name: string | null;
  battery_name: string | null;
  owner_name: string | null;
  test_water_bwpd: number | null;
  test_gas_mcfd: number | null;
}

export default async function DowntimePage({
  searchParams,
}: {
  searchParams: { state?: string; county?: string; field?: string };
}) {
  const user = await getSessionUser();
  const canEdit = user!.role !== "MGMT_RO";

  const fState = searchParams.state || "";
  const fCounty = searchParams.county || "";
  const fField = searchParams.field || "";
  // filter down events by the associated well's (or battery's) state/county/field
  const filt: string[] = [];
  const fp: any[] = [];
  if (fState) {
    fp.push(fState);
    filt.push(`(w.state = $${fp.length} or b.state = $${fp.length})`);
  }
  if (fCounty) {
    fp.push(fCounty);
    filt.push(`(w.county = $${fp.length} or b.county = $${fp.length})`);
  }
  if (fField) {
    fp.push(fField);
    filt.push(`(w.field = $${fp.length} or b.field = $${fp.length})`);
  }
  const extra = filt.length ? ` and ${filt.join(" and ")}` : "";

  const base = `
    select d.*, w.name as well_name, b.name as battery_name, u.name as owner_name,
           w.test_water_bwpd, w.test_gas_mcfd
      from downtime_events d
      left join wells w on w.id = d.well_id
      left join batteries b on b.id = d.battery_id
      left join users u on u.id = d.owner_id`;

  const [open, resolved, wells, users, filterRows] = await Promise.all([
    query<DownRow>(
      `${base} where d.status='OPEN'${extra} order by d.start_at asc`,
      fp
    ),
    query<DownRow>(
      `${base} where d.status='RESOLVED'${extra} order by d.end_at desc limit 100`,
      fp
    ),
    query<any>(
      `select id, name, test_oil_bopd, test_water_bwpd, test_gas_mcfd
         from wells where active and status != 'INACTIVE' order by name`
    ),
    query<{ id: string; name: string }>(
      `select id, name from users where active order by name`
    ),
    query<FilterRow>(
      `select distinct state, county, field from wells`
    ),
  ]);

  const totalLoss = open.reduce((s, d) => s + (d.est_bopd_loss || 0), 0);

  return (
    <div>
      <PageHeader
        title="Down Wells"
        subtitle="Every down event has an owner and a running clock. Nothing disappears — resolved events roll into history."
        action={
          canEdit && (
            <ReportDownForm
              wells={wells}
              users={users}
              action={reportDowntime}
            />
          )
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="Wells Down Now" value={open.length} tone="danger" />
        <StatCard
          label="Est. BOPD Lost"
          value={fmtNum(totalLoss, 0)}
          tone="warn"
          sub="sum of open events"
        />
        <StatCard
          label="Resolved (recent)"
          value={resolved.length}
          tone="good"
        />
      </div>

      <PageFilters
        basePath="/downtime"
        rows={filterRows}
        state={fState}
        county={fCounty}
        field={fField}
        count={open.length + resolved.length}
      />

      <h2 className="mb-3 text-lg font-semibold">Currently Down</h2>
      {open.length === 0 ? (
        <EmptyState title="Nothing down right now 🎉" />
      ) : (
        <div className="space-y-3">
          {open.map((d) => (
            <div
              key={d.id}
              className="card border-l-4 border-l-red-500 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">
                      {d.well_name || d.battery_name || "Unassigned"}
                    </span>
                    {d.category && <Badge value={d.category.toUpperCase()} />}
                  </div>
                  <div className="mt-1 text-sm text-slate-600">{d.reason}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    Down since {fmtDateTime(d.start_at)} · Owner:{" "}
                    {d.owner_name || "—"}
                  </div>
                  {(d.est_bopd_loss ||
                    d.test_water_bwpd ||
                    d.test_gas_mcfd) && (
                    <div className="mt-1 text-xs font-medium text-red-600">
                      Losing ~{fmtNum(d.est_bopd_loss, 0)} BOPD
                      {d.test_water_bwpd != null &&
                        ` · ${fmtNum(d.test_water_bwpd, 0)} BWPD`}
                      {d.test_gas_mcfd != null &&
                        ` · ${fmtNum(d.test_gas_mcfd, 0)} MCFD`}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-red-600">
                    {durationSince(d.start_at)}
                  </div>
                  <div className="text-xs text-slate-400">down</div>
                </div>
              </div>
              {canEdit && (
                <form
                  action={resolveDowntime}
                  className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3"
                >
                  <input type="hidden" name="id" value={d.id} />
                  <input
                    name="note"
                    className="input flex-1"
                    placeholder="Resolution note (optional)"
                  />
                  <label className="flex items-center gap-1 text-xs text-slate-500">
                    <input type="checkbox" name="bring_up" defaultChecked />
                    Bring well back up
                  </label>
                  <button className="btn-primary">Resolve</button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-8 text-lg font-semibold">Downtime History</h2>
      {resolved.length === 0 ? (
        <EmptyState title="No resolved downtime yet" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="th">Well</th>
                <th className="th">Reason</th>
                <th className="th">Category</th>
                <th className="th">Down</th>
                <th className="th">Restored</th>
                <th className="th">Duration</th>
                <th className="th">Owner</th>
              </tr>
            </thead>
            <tbody>
              {resolved.map((d) => (
                <tr key={d.id} className="border-b border-slate-50">
                  <td className="td font-medium">
                    {d.well_name || d.battery_name || "—"}
                  </td>
                  <td className="td">{d.reason}</td>
                  <td className="td">{d.category || "—"}</td>
                  <td className="td">{fmtDateTime(d.start_at)}</td>
                  <td className="td">{fmtDateTime(d.end_at)}</td>
                  <td className="td">
                    {durationSince(d.start_at, d.end_at)}
                  </td>
                  <td className="td">{d.owner_name || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

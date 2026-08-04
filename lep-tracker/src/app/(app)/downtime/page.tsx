import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { PageHeader, Badge, EmptyState, StatCard } from "@/components/ui";
import { fmtDateTime, durationSince, fmtNum } from "@/lib/format";
import { WellFilters } from "@/components/Filters";
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
}

export default async function DowntimePage({
  searchParams,
}: {
  searchParams: { state?: string; field?: string };
}) {
  const user = await getSessionUser();
  const canEdit = user!.role !== "MGMT_RO";

  const fState = searchParams.state || "";
  const fField = searchParams.field || "";
  // filter down events by the associated well's (or battery's) state/field
  const filt: string[] = [];
  const fp: any[] = [];
  if (fState) {
    fp.push(fState);
    filt.push(`(w.state = $${fp.length} or b.state = $${fp.length})`);
  }
  if (fField) {
    fp.push(fField);
    filt.push(`(w.field = $${fp.length} or b.field = $${fp.length})`);
  }
  const extra = filt.length ? ` and ${filt.join(" and ")}` : "";

  const base = `
    select d.*, w.name as well_name, b.name as battery_name, u.name as owner_name
      from downtime_events d
      left join wells w on w.id = d.well_id
      left join batteries b on b.id = d.battery_id
      left join users u on u.id = d.owner_id`;

  const [open, resolved, wells, users, states, fields] = await Promise.all([
    query<DownRow>(
      `${base} where d.status='OPEN'${extra} order by d.start_at asc`,
      fp
    ),
    query<DownRow>(
      `${base} where d.status='RESOLVED'${extra} order by d.end_at desc limit 100`,
      fp
    ),
    query<{ id: string; name: string }>(
      `select id, name from wells where active and status != 'INACTIVE' order by name`
    ),
    query<{ id: string; name: string }>(
      `select id, name from users where active order by name`
    ),
    query<{ v: string }>(
      `select distinct state as v from wells where state is not null and state <> '' order by state`
    ),
    query<{ v: string }>(
      `select distinct field as v from wells where field is not null and field <> '' order by field`
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
            <details className="relative">
              <summary className="btn-primary cursor-pointer list-none">
                + Report Down Well
              </summary>
              <form
                action={reportDowntime}
                className="card absolute right-0 z-20 mt-2 w-96 space-y-3 p-4"
              >
                <div>
                  <label className="label">Well</label>
                  <select name="well_id" className="input" required>
                    <option value="">— select well —</option>
                    {wells.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Reason down *</label>
                  <input
                    name="reason"
                    className="input"
                    placeholder="Rod parted, pump change, power out…"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">Category</label>
                    <select name="category" className="input">
                      <option value="">—</option>
                      <option>Mechanical</option>
                      <option>Electrical</option>
                      <option>Facility</option>
                      <option>Weather</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Est. BOPD loss</label>
                    <input
                      name="est_bopd_loss"
                      type="number"
                      step="any"
                      className="input"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">Down since</label>
                    <input
                      name="start_at"
                      type="datetime-local"
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label">Owner</label>
                    <select name="owner_id" className="input">
                      <option value="">Me</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <button className="btn-primary w-full">Report down</button>
              </form>
            </details>
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

      <WellFilters
        basePath="/downtime"
        states={states.map((s) => s.v)}
        fields={fields.map((f) => f.v)}
        state={fState}
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
                    {d.est_bopd_loss
                      ? ` · ~${fmtNum(d.est_bopd_loss, 0)} BOPD loss`
                      : ""}
                  </div>
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

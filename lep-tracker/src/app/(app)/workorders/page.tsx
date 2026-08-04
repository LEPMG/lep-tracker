import Link from "next/link";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { createWorkOrder } from "./actions";

export const dynamic = "force-dynamic";

interface WORow {
  id: string;
  number: number;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  well_name: string | null;
  battery_name: string | null;
  assignee: string | null;
  vendor_name: string | null;
  open_actions: number;
  total_actions: number;
}

export default async function WorkOrdersPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const user = await getSessionUser();
  const canEdit = user!.role !== "MGMT_RO";
  const filter = searchParams.status || "ACTIVE";

  const where =
    filter === "ALL"
      ? ""
      : filter === "ACTIVE"
        ? `where wo.status in ('OPEN','IN_PROGRESS','ON_HOLD')`
        : `where wo.status = '${filter.replace(/[^A-Z_]/g, "")}'`;

  const [rows, wells, batteries, users, vendors] = await Promise.all([
    query<WORow>(
      `select wo.*, w.name as well_name, b.name as battery_name,
              u.name as assignee, v.name as vendor_name,
              coalesce((select count(*) from action_items a where a.work_order_id=wo.id and not a.done),0) as open_actions,
              coalesce((select count(*) from action_items a where a.work_order_id=wo.id),0) as total_actions
         from work_orders wo
         left join wells w on w.id=wo.well_id
         left join batteries b on b.id=wo.battery_id
         left join users u on u.id=wo.assigned_to_id
         left join vendors v on v.id=wo.vendor_id
         ${where}
        order by
          case wo.priority when 'URGENT' then 0 when 'HIGH' then 1 when 'MEDIUM' then 2 else 3 end,
          wo.created_at desc`
    ),
    query<{ id: string; name: string }>(
      `select id, name from wells order by name`
    ),
    query<{ id: string; name: string }>(
      `select id, name from batteries order by name`
    ),
    query<{ id: string; name: string }>(
      `select id, name from users where active order by name`
    ),
    query<{ id: string; name: string }>(
      `select id, name from vendors where active order by name`
    ),
  ]);

  const tabs = [
    ["ACTIVE", "Active"],
    ["OPEN", "Open"],
    ["IN_PROGRESS", "In progress"],
    ["COMPLETED", "Completed"],
    ["ALL", "All"],
  ];

  return (
    <div>
      <PageHeader
        title="Work Orders"
        subtitle="Assign, track, and close out action items on any well or battery."
        action={
          canEdit && (
            <details className="relative">
              <summary className="btn-primary cursor-pointer list-none">
                + New Work Order
              </summary>
              <form
                action={createWorkOrder}
                className="card absolute right-0 z-20 mt-2 w-96 space-y-3 p-4"
              >
                <div>
                  <label className="label">Title *</label>
                  <input name="title" className="input" required />
                </div>
                <div>
                  <label className="label">Description</label>
                  <textarea name="description" className="input" rows={2} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">Well</label>
                    <select name="well_id" className="input">
                      <option value="">—</option>
                      {wells.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Battery</label>
                    <select name="battery_id" className="input">
                      <option value="">—</option>
                      {batteries.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">Priority</label>
                    <select name="priority" className="input" defaultValue="MEDIUM">
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="URGENT">Urgent</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Due date</label>
                    <input name="due_date" type="date" className="input" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">Assign to</label>
                    <select name="assigned_to_id" className="input">
                      <option value="">—</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Vendor</label>
                    <select name="vendor_id" className="input">
                      <option value="">—</option>
                      {vendors.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label">Est. cost ($)</label>
                  <input
                    name="est_cost"
                    type="number"
                    step="any"
                    className="input"
                  />
                </div>
                <button className="btn-primary w-full">Create work order</button>
              </form>
            </details>
          )
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map(([val, label]) => (
          <Link
            key={val}
            href={`/workorders?status=${val}`}
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              filter === val
                ? "bg-brand-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No work orders here" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="th">WO #</th>
                <th className="th">Title</th>
                <th className="th">Location</th>
                <th className="th">Priority</th>
                <th className="th">Status</th>
                <th className="th">Assignee</th>
                <th className="th">Actions</th>
                <th className="th">Due</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="td">
                    <Link
                      href={`/workorders/${r.id}`}
                      className="font-semibold text-brand-700"
                    >
                      #{r.number}
                    </Link>
                  </td>
                  <td className="td">
                    <Link href={`/workorders/${r.id}`} className="font-medium">
                      {r.title}
                    </Link>
                  </td>
                  <td className="td">
                    {r.well_name || r.battery_name || "—"}
                  </td>
                  <td className="td">
                    <Badge value={r.priority} />
                  </td>
                  <td className="td">
                    <Badge value={r.status} />
                  </td>
                  <td className="td">{r.assignee || "—"}</td>
                  <td className="td">
                    {r.total_actions > 0
                      ? `${r.total_actions - r.open_actions}/${r.total_actions}`
                      : "—"}
                  </td>
                  <td className="td">{fmtDate(r.due_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

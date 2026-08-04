import Link from "next/link";
import { notFound } from "next/navigation";
import { query, queryOne } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { Badge } from "@/components/ui";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { addCostEntry } from "../../vendors/actions";
import {
  updateWorkOrder,
  addActionItem,
  toggleActionItem,
  addWorkOrderComment,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function WorkOrderDetail({
  params,
}: {
  params: { id: string };
}) {
  const user = await getSessionUser();
  const canEdit = user!.role !== "MGMT_RO";
  const id = params.id;

  const wo = await queryOne<any>(
    `select wo.*, w.name as well_name, b.name as battery_name,
            u.name as assignee, v.name as vendor_name, c.name as creator
       from work_orders wo
       left join wells w on w.id=wo.well_id
       left join batteries b on b.id=wo.battery_id
       left join users u on u.id=wo.assigned_to_id
       left join vendors v on v.id=wo.vendor_id
       left join users c on c.id=wo.created_by_id
      where wo.id=$1`,
    [id]
  );
  if (!wo) notFound();

  const [actions, costs, comments, users, vendors] = await Promise.all([
    query<any>(
      `select a.*, u.name as owner_name from action_items a
        left join users u on u.id=a.owner_id
       where a.work_order_id=$1 order by a.done, a.created_at`,
      [id]
    ),
    query<any>(
      `select ce.*, v.name as vendor_name from cost_entries ce
        left join vendors v on v.id=ce.vendor_id
       where ce.work_order_id=$1 order by ce.cost_date desc`,
      [id]
    ),
    query<any>(
      `select cm.*, u.name as author from comments cm
        left join users u on u.id=cm.author_id
       where cm.work_order_id=$1 order by cm.created_at desc`,
      [id]
    ),
    query<{ id: string; name: string }>(
      `select id, name from users where active order by name`
    ),
    query<{ id: string; name: string }>(
      `select id, name from vendors where active order by name`
    ),
  ]);

  const totalCost = costs.reduce((s: number, c: any) => s + Number(c.amount), 0);

  return (
    <div>
      <Link href="/workorders" className="text-sm text-brand-700">
        ← Work Orders
      </Link>
      <div className="mt-2 mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            #{wo.number} · {wo.title}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <Badge value={wo.status} />
            <Badge value={wo.priority} />
            <span>
              {wo.well_name || wo.battery_name || "No location"} · Created by{" "}
              {wo.creator || "—"} on {fmtDate(wo.created_at)}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="space-y-6 md:col-span-2">
          {wo.description && (
            <div className="card p-4">
              <div className="label">Description</div>
              <p className="text-sm text-slate-700">{wo.description}</p>
            </div>
          )}

          {/* Action items */}
          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Action Items</h2>
            </div>
            <div className="space-y-2">
              {actions.length === 0 && (
                <p className="text-sm text-slate-400">No action items yet.</p>
              )}
              {actions.map((a: any) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 rounded-md border border-slate-100 px-3 py-2"
                >
                  <form action={toggleActionItem}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="work_order_id" value={id} />
                    <input type="hidden" name="done" value={String(!a.done)} />
                    <button
                      className={`flex h-5 w-5 items-center justify-center rounded border ${
                        a.done
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-slate-300"
                      }`}
                      title="Toggle"
                    >
                      {a.done ? "✓" : ""}
                    </button>
                  </form>
                  <div className="flex-1">
                    <div
                      className={`text-sm ${
                        a.done ? "text-slate-400 line-through" : "text-slate-700"
                      }`}
                    >
                      {a.text}
                    </div>
                    <div className="text-xs text-slate-400">
                      {a.owner_name ? `${a.owner_name} · ` : ""}
                      {a.due_date ? `Due ${fmtDate(a.due_date)}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {canEdit && (
              <form
                action={addActionItem}
                className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3"
              >
                <input type="hidden" name="work_order_id" value={id} />
                <input
                  name="text"
                  className="input flex-1"
                  placeholder="Add an action item…"
                  required
                />
                <select name="owner_id" className="input w-40">
                  <option value="">Owner…</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <input name="due_date" type="date" className="input w-40" />
                <button className="btn-primary">Add</button>
              </form>
            )}
          </div>

          {/* Costs */}
          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Costs</h2>
              <span className="text-sm font-semibold text-slate-700">
                Total: {fmtMoney(totalCost)}
              </span>
            </div>
            {costs.length > 0 && (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="th">Date</th>
                    <th className="th">Category</th>
                    <th className="th">Vendor</th>
                    <th className="th">Description</th>
                    <th className="th text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {costs.map((c: any) => (
                    <tr key={c.id} className="border-b border-slate-50">
                      <td className="td">{fmtDate(c.cost_date)}</td>
                      <td className="td">
                        <Badge value={c.category} />
                      </td>
                      <td className="td">{c.vendor_name || "—"}</td>
                      <td className="td">{c.description || "—"}</td>
                      <td className="td text-right">{fmtMoney(c.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {canEdit && (
              <form
                action={addCostEntry}
                className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3"
              >
                <input type="hidden" name="work_order_id" value={id} />
                <input type="hidden" name="redirect_to" value={`/workorders/${id}`} />
                <select name="category" className="input w-36">
                  <option value="LABOR">Labor</option>
                  <option value="EQUIPMENT">Equipment</option>
                  <option value="CHEMICAL">Chemical</option>
                  <option value="TRUCKING">Trucking</option>
                  <option value="ELECTRICAL">Electrical</option>
                  <option value="RENTAL">Rental</option>
                  <option value="OTHER">Other</option>
                </select>
                <select name="vendor_id" className="input w-36">
                  <option value="">Vendor…</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
                <input
                  name="description"
                  className="input flex-1"
                  placeholder="Description"
                />
                <input
                  name="amount"
                  type="number"
                  step="any"
                  className="input w-28"
                  placeholder="$"
                  required
                />
                <input name="cost_date" type="date" className="input w-40" required />
                <button className="btn-primary">Add cost</button>
              </form>
            )}
          </div>

          {/* Activity */}
          <div className="card p-4">
            <h2 className="mb-3 font-semibold">Activity & Notes</h2>
            {canEdit && (
              <form action={addWorkOrderComment} className="mb-4 flex gap-2">
                <input type="hidden" name="work_order_id" value={id} />
                <input
                  name="body"
                  className="input flex-1"
                  placeholder="Add a note…"
                  required
                />
                <button className="btn-ghost">Post</button>
              </form>
            )}
            <div className="space-y-3">
              {comments.length === 0 && (
                <p className="text-sm text-slate-400">No notes yet.</p>
              )}
              {comments.map((c: any) => (
                <div key={c.id} className="text-sm">
                  <span className="font-semibold text-slate-700">
                    {c.author || "—"}
                  </span>{" "}
                  <span className="text-xs text-slate-400">
                    {fmtDateTime(c.created_at)}
                  </span>
                  <p className="text-slate-600">{c.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar: edit fields */}
        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="mb-3 font-semibold">Details</h2>
            {canEdit ? (
              <form action={updateWorkOrder} className="space-y-3">
                <input type="hidden" name="id" value={id} />
                <div>
                  <label className="label">Status</label>
                  <select
                    name="status"
                    className="input"
                    defaultValue={wo.status}
                  >
                    <option value="OPEN">Open</option>
                    <option value="IN_PROGRESS">In progress</option>
                    <option value="ON_HOLD">On hold</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className="label">Priority</label>
                  <select
                    name="priority"
                    className="input"
                    defaultValue={wo.priority}
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="label">Assigned to</label>
                  <select
                    name="assigned_to_id"
                    className="input"
                    defaultValue={wo.assigned_to_id || ""}
                  >
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
                  <select
                    name="vendor_id"
                    className="input"
                    defaultValue={wo.vendor_id || ""}
                  >
                    <option value="">—</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Due date</label>
                  <input
                    name="due_date"
                    type="date"
                    className="input"
                    defaultValue={
                      wo.due_date
                        ? new Date(wo.due_date).toISOString().slice(0, 10)
                        : ""
                    }
                  />
                </div>
                <button className="btn-primary w-full">Save</button>
              </form>
            ) : (
              <dl className="space-y-2 text-sm">
                <Row k="Status" v={<Badge value={wo.status} />} />
                <Row k="Priority" v={<Badge value={wo.priority} />} />
                <Row k="Assigned to" v={wo.assignee || "—"} />
                <Row k="Vendor" v={wo.vendor_name || "—"} />
                <Row k="Due" v={fmtDate(wo.due_date)} />
              </dl>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-400">{k}</dt>
      <dd className="font-medium text-slate-700">{v}</dd>
    </div>
  );
}

import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { PageHeader, Badge, EmptyState, StatCard } from "@/components/ui";
import { fmtMoney, fmtDate } from "@/lib/format";
import { createVendor, addCostEntry } from "./actions";

export const dynamic = "force-dynamic";

export default async function VendorsPage() {
  const user = await getSessionUser();
  const canEdit = user!.role !== "MGMT_RO";

  const [vendors, recentCosts, byVendor, byCategory, ytd] = await Promise.all([
    query<any>(
      `select v.*,
              coalesce((select sum(amount) from cost_entries c where c.vendor_id=v.id),0) as total_cost,
              coalesce((select count(*) from work_orders w where w.vendor_id=v.id),0) as wo_count
         from vendors v order by v.name`
    ),
    query<any>(
      `select c.*, v.name as vendor_name, wo.number as wo_number
         from cost_entries c
         left join vendors v on v.id=c.vendor_id
         left join work_orders wo on wo.id=c.work_order_id
        order by c.cost_date desc limit 20`
    ),
    query<any>(
      `select v.name, sum(c.amount) as total
         from cost_entries c join vendors v on v.id=c.vendor_id
        group by v.name order by total desc limit 8`
    ),
    query<any>(
      `select category, sum(amount) as total
         from cost_entries group by category order by total desc`
    ),
    query<{ total: number }>(
      `select coalesce(sum(amount),0) as total from cost_entries
        where cost_date >= date_trunc('year', now())`
    ),
  ]);

  const ytdTotal = Number(ytd[0]?.total || 0);

  return (
    <div>
      <PageHeader
        title="Vendors & Costs"
        subtitle="Who's on location, and where the downtime dollars go."
        action={
          canEdit && (
            <div className="flex gap-2">
              <details className="relative">
                <summary className="btn-ghost cursor-pointer list-none">
                  + Log Cost
                </summary>
                <form
                  action={addCostEntry}
                  className="card absolute right-0 z-20 mt-2 w-80 space-y-3 p-4"
                >
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label">Category</label>
                      <select name="category" className="input">
                        <option value="LABOR">Labor</option>
                        <option value="EQUIPMENT">Equipment</option>
                        <option value="CHEMICAL">Chemical</option>
                        <option value="TRUCKING">Trucking</option>
                        <option value="ELECTRICAL">Electrical</option>
                        <option value="RENTAL">Rental</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Vendor</label>
                      <select name="vendor_id" className="input">
                        <option value="">—</option>
                        {vendors.map((v: any) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="label">Description</label>
                    <input name="description" className="input" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label">Amount ($) *</label>
                      <input
                        name="amount"
                        type="number"
                        step="any"
                        className="input"
                        required
                      />
                    </div>
                    <div>
                      <label className="label">Date *</label>
                      <input
                        name="cost_date"
                        type="date"
                        className="input"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label">Invoice #</label>
                    <input name="invoice_no" className="input" />
                  </div>
                  <button className="btn-primary w-full">Save cost</button>
                </form>
              </details>
              <details className="relative">
                <summary className="btn-primary cursor-pointer list-none">
                  + Add Vendor
                </summary>
                <form
                  action={createVendor}
                  className="card absolute right-0 z-20 mt-2 w-80 space-y-3 p-4"
                >
                  <div>
                    <label className="label">Name *</label>
                    <input name="name" className="input" required />
                  </div>
                  <div>
                    <label className="label">Service</label>
                    <input
                      name="service"
                      className="input"
                      placeholder="Pulling unit, hot oil, electrician…"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label">Contact</label>
                      <input name="contact" className="input" />
                    </div>
                    <div>
                      <label className="label">Phone</label>
                      <input name="phone" className="input" />
                    </div>
                  </div>
                  <div>
                    <label className="label">Email</label>
                    <input name="email" className="input" />
                  </div>
                  <button className="btn-primary w-full">Save vendor</button>
                </form>
              </details>
            </div>
          )
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Cost YTD" value={fmtMoney(ytdTotal)} tone="warn" />
        <StatCard label="Vendors" value={vendors.length} />
        {byCategory.slice(0, 2).map((c: any) => (
          <StatCard
            key={c.category}
            label={`${c.category} spend`}
            value={fmtMoney(Number(c.total))}
          />
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Vendors */}
        <div>
          <h2 className="mb-3 text-lg font-semibold">Vendors</h2>
          {vendors.length === 0 ? (
            <EmptyState title="No vendors yet" />
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="th">Vendor</th>
                    <th className="th">Service</th>
                    <th className="th">Contact</th>
                    <th className="th text-right">Total spend</th>
                  </tr>
                </thead>
                <tbody>
                  {vendors.map((v: any) => (
                    <tr key={v.id} className="border-b border-slate-50">
                      <td className="td font-medium">{v.name}</td>
                      <td className="td">{v.service || "—"}</td>
                      <td className="td">
                        {v.contact || "—"}
                        {v.phone ? ` · ${v.phone}` : ""}
                      </td>
                      <td className="td text-right font-semibold">
                        {fmtMoney(Number(v.total_cost))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Spend by category */}
        <div>
          <h2 className="mb-3 text-lg font-semibold">Spend by Category</h2>
          <div className="card p-4">
            {byCategory.length === 0 ? (
              <p className="text-sm text-slate-400">No costs logged yet.</p>
            ) : (
              <div className="space-y-2">
                {byCategory.map((c: any) => {
                  const max = Number(byCategory[0].total) || 1;
                  const pct = (Number(c.total) / max) * 100;
                  return (
                    <div key={c.category}>
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{c.category}</span>
                        <span>{fmtMoney(Number(c.total))}</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full bg-brand-600"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent costs */}
      <h2 className="mb-3 mt-8 text-lg font-semibold">Recent Costs</h2>
      {recentCosts.length === 0 ? (
        <EmptyState title="No costs logged yet" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="th">Date</th>
                <th className="th">Category</th>
                <th className="th">Vendor</th>
                <th className="th">Work Order</th>
                <th className="th">Description</th>
                <th className="th text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {recentCosts.map((c: any) => (
                <tr key={c.id} className="border-b border-slate-50">
                  <td className="td">{fmtDate(c.cost_date)}</td>
                  <td className="td">
                    <Badge value={c.category} />
                  </td>
                  <td className="td">{c.vendor_name || "—"}</td>
                  <td className="td">
                    {c.wo_number ? `#${c.wo_number}` : "—"}
                  </td>
                  <td className="td">{c.description || "—"}</td>
                  <td className="td text-right font-semibold">
                    {fmtMoney(Number(c.amount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

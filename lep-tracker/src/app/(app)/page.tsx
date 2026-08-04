import Link from "next/link";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { StatCard, Badge, EmptyState } from "@/components/ui";
import { fmtMoney, fmtNum, durationSince, fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await getSessionUser();

  const [
    downCount,
    openWO,
    lossRow,
    ytdRow,
    downList,
    hotWO,
  ] = await Promise.all([
    query<{ n: number }>(
      `select count(*)::int as n from downtime_events where status='OPEN'`
    ),
    query<{ n: number }>(
      `select count(*)::int as n from work_orders where status in ('OPEN','IN_PROGRESS','ON_HOLD')`
    ),
    query<{ total: number }>(
      `select coalesce(sum(est_bopd_loss),0) as total from downtime_events where status='OPEN'`
    ),
    query<{ total: number }>(
      `select coalesce(sum(amount),0) as total from cost_entries where cost_date >= date_trunc('year', now())`
    ),
    query<any>(
      `select d.*, w.name as well_name, b.name as battery_name, u.name as owner_name
         from downtime_events d
         left join wells w on w.id=d.well_id
         left join batteries b on b.id=d.battery_id
         left join users u on u.id=d.owner_id
        where d.status='OPEN' order by d.start_at asc limit 8`
    ),
    query<any>(
      `select wo.*, w.name as well_name, b.name as battery_name, u.name as assignee
         from work_orders wo
         left join wells w on w.id=wo.well_id
         left join batteries b on b.id=wo.battery_id
         left join users u on u.id=wo.assigned_to_id
        where wo.status in ('OPEN','IN_PROGRESS','ON_HOLD')
        order by case wo.priority when 'URGENT' then 0 when 'HIGH' then 1 when 'MEDIUM' then 2 else 3 end,
                 wo.due_date asc nulls last
        limit 8`
    ),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Welcome back, {user!.name.split(" ")[0]}
        </h1>
        <p className="text-sm text-slate-500">Field operations at a glance.</p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Wells Down"
          value={downCount[0].n}
          tone={downCount[0].n > 0 ? "danger" : "good"}
          href="/downtime"
        />
        <StatCard
          label="Est. BOPD Lost"
          value={fmtNum(Number(lossRow[0].total), 0)}
          tone="warn"
          href="/downtime"
        />
        <StatCard
          label="Open Work Orders"
          value={openWO[0].n}
          href="/workorders"
        />
        <StatCard
          label="Cost YTD"
          value={fmtMoney(Number(ytdRow[0].total))}
          href="/vendors"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Currently Down</h2>
            <Link href="/downtime" className="text-sm text-brand-700">
              View all →
            </Link>
          </div>
          {downList.length === 0 ? (
            <EmptyState title="Nothing down right now 🎉" />
          ) : (
            <div className="space-y-2">
              {downList.map((d: any) => (
                <div
                  key={d.id}
                  className="card flex items-center justify-between border-l-4 border-l-red-500 p-3"
                >
                  <div>
                    <div className="font-medium text-slate-900">
                      {d.well_name || d.battery_name || "—"}
                    </div>
                    <div className="text-xs text-slate-500">
                      {d.reason} · {d.owner_name || "unassigned"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-red-600">
                      {durationSince(d.start_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Priority Work Orders</h2>
            <Link href="/workorders" className="text-sm text-brand-700">
              View all →
            </Link>
          </div>
          {hotWO.length === 0 ? (
            <EmptyState title="No open work orders" />
          ) : (
            <div className="space-y-2">
              {hotWO.map((w: any) => (
                <Link
                  key={w.id}
                  href={`/workorders/${w.id}`}
                  className="card flex items-center justify-between p-3 hover:bg-slate-50"
                >
                  <div>
                    <div className="font-medium text-slate-900">
                      #{w.number} {w.title}
                    </div>
                    <div className="text-xs text-slate-500">
                      {w.well_name || w.battery_name || "—"} ·{" "}
                      {w.assignee || "unassigned"}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge value={w.priority} />
                    <span className="text-xs text-slate-400">
                      {w.due_date ? `Due ${fmtDate(w.due_date)}` : ""}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

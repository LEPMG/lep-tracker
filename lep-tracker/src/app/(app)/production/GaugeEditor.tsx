"use client";

import { useMemo, useState } from "react";
import { saveGaugeReading } from "./actions";
import { fmtNum } from "@/lib/format";

type Tank = {
  id: string;
  name: string;
  type: string;
  bbls_per_inch: number;
};

type Reading = {
  date: string; // yyyy-mm-dd
  notes: string | null;
  tanks: Record<string, { feet: number; inches: number; barrels: number }>;
};

export function GaugeEditor({
  batteryId,
  tanks,
  readings,
  today,
}: {
  batteryId: string;
  tanks: Tank[];
  readings: Reading[];
  today: string;
}) {
  const byDate = useMemo(() => {
    const m: Record<string, Reading> = {};
    for (const r of readings) m[r.date] = r;
    return m;
  }, [readings]);

  const [date, setDate] = useState<string>(today);
  const existing = byDate[date];

  // controlled feet/inches per tank; re-seed when the date changes
  const [vals, setVals] = useState<Record<string, { ft: string; in: string }>>(
    () => seed(byDate[today], tanks)
  );
  const [notes, setNotes] = useState<string>(existing?.notes ?? "");
  const [seededFor, setSeededFor] = useState<string>(today);

  // when the selected date changes, load that day's gauges (edit) or blanks (new)
  if (seededFor !== date) {
    setVals(seed(byDate[date], tanks));
    setNotes(byDate[date]?.notes ?? "");
    setSeededFor(date);
  }

  const isEdit = !!existing;

  function pick(d: string) {
    setDate(d);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* entry / edit form */}
      <div className="card p-4">
        {isEdit && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-800">
            <span>✎ Editing {prettyDate(date)} — correct the numbers and save.</span>
            <button
              type="button"
              onClick={() => pick(today)}
              className="ml-auto text-brand-600 underline"
            >
              ＋ New reading
            </button>
          </div>
        )}

        <form action={saveGaugeReading} className="space-y-3">
          <input type="hidden" name="battery_id" value={batteryId} />
          <input type="hidden" name="reading_date" value={date} />

          <div>
            <label className="label">Reading date</label>
            <input
              type="date"
              className="input"
              value={date}
              onChange={(e) => pick(e.target.value)}
            />
            {!isEdit && (
              <p className="mt-1 text-xs text-slate-400">
                Pick a past date to load and fix that day&apos;s gauges.
              </p>
            )}
          </div>

          <div className="space-y-2">
            {tanks.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-2 rounded-lg border border-slate-100 p-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{t.name}</div>
                  <div className="text-xs text-slate-400">
                    {t.type} · {fmtNum(t.bbls_per_inch, 2)} bbl/in
                  </div>
                </div>
                <div className="w-16">
                  <label className="label !mb-0.5">Feet</label>
                  <input
                    name={`feet_${t.id}`}
                    type="number"
                    inputMode="numeric"
                    className="input !py-1.5"
                    value={vals[t.id]?.ft ?? "0"}
                    onChange={(e) =>
                      setVals((v) => ({
                        ...v,
                        [t.id]: { ft: e.target.value, in: v[t.id]?.in ?? "0" },
                      }))
                    }
                  />
                </div>
                <div className="w-20">
                  <label className="label !mb-0.5">Inches</label>
                  <input
                    name={`inches_${t.id}`}
                    type="number"
                    step="any"
                    inputMode="decimal"
                    className="input !py-1.5"
                    value={vals[t.id]?.in ?? "0"}
                    onChange={(e) =>
                      setVals((v) => ({
                        ...v,
                        [t.id]: { ft: v[t.id]?.ft ?? "0", in: e.target.value },
                      }))
                    }
                  />
                </div>
              </div>
            ))}
          </div>

          <div>
            <label className="label">Remarks</label>
            <input
              name="notes"
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. 638 down HIT"
            />
          </div>

          <button className="btn-primary w-full">
            {isEdit ? "Update gauges" : "Save gauges"}
          </button>
        </form>
      </div>

      {/* gauge history */}
      <div className="card p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="font-semibold">Gauge history</h3>
          <span className="text-xs text-slate-400">tap a day to edit</span>
        </div>
        {readings.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            No gaugings yet.
          </p>
        ) : (
          <div className="max-h-[340px] overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-white">
                <tr>
                  <th className="th">Date</th>
                  {tanks.map((t) => (
                    <th key={t.id} className="th text-right">
                      {t.name}
                    </th>
                  ))}
                  <th className="th text-right">Total</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {readings.map((r) => {
                  const total = tanks.reduce(
                    (s, t) => s + (r.tanks[t.id]?.barrels ?? 0),
                    0
                  );
                  return (
                    <tr
                      key={r.date}
                      onClick={() => pick(r.date)}
                      className={`cursor-pointer border-b border-slate-50 hover:bg-brand-50/40 ${
                        r.date === date ? "bg-brand-50/60" : ""
                      }`}
                    >
                      <td className="td whitespace-nowrap">{prettyDate(r.date)}</td>
                      {tanks.map((t) => (
                        <td
                          key={t.id}
                          className="td text-right tabular-nums text-slate-600"
                        >
                          {r.tanks[t.id] ? fmtNum(r.tanks[t.id].barrels, 1) : "—"}
                        </td>
                      ))}
                      <td className="td text-right font-semibold tabular-nums">
                        {fmtNum(total, 1)}
                      </td>
                      <td className="td text-right text-xs font-semibold text-brand-600">
                        Edit ›
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function seed(
  r: Reading | undefined,
  tanks: Tank[]
): Record<string, { ft: string; in: string }> {
  const out: Record<string, { ft: string; in: string }> = {};
  for (const t of tanks) {
    const tr = r?.tanks[t.id];
    out[t.id] = {
      ft: tr ? String(tr.feet) : "0",
      in: tr ? String(tr.inches) : "0",
    };
  }
  return out;
}

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

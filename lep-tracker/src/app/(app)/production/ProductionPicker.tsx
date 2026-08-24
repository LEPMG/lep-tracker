"use client";
import Link from "next/link";
import { useState } from "react";

type Bat = { id: string; name: string; field: string; state: string };

export function ProductionPicker({
  batteries,
  selectedId,
  range,
}: {
  batteries: Bat[];
  selectedId: string;
  range?: string;
}) {
  const states = Array.from(
    new Set(batteries.map((b) => b.state).filter(Boolean))
  );
  const [state, setState] = useState<string>("ALL");
  const shown = batteries.filter((b) => state === "ALL" || b.state === state);

  // group by field; order preserved from the query (state, field, name)
  const groups: { key: string; field: string; state: string; items: Bat[] }[] =
    [];
  for (const b of shown) {
    const key = `${b.state}|${b.field}`;
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push((g = { key, field: b.field, state: b.state, items: [] }));
    g.items.push(b);
  }

  // Keep the chosen range when switching batteries, the way DateRange keeps
  // the chosen battery when switching ranges.
  const href = (id: string) =>
    range ? `/production?battery=${id}&range=${range}` : `/production?battery=${id}`;

  return (
    <div className="mb-6">
      {states.length > 1 && (
        <div className="mb-4 inline-flex rounded-xl border border-slate-200 bg-white p-1">
          {["ALL", ...states].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setState(s)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                state === s
                  ? "bg-brand-600 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {s === "ALL" ? "All" : s}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {groups.map((g) => (
          <div key={g.key}>
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              {g.state ? `${g.state} · ` : ""}
              {g.field || "Unassigned"}
            </div>
            <div className="flex flex-wrap gap-2">
              {g.items.map((b) => (
                <Link
                  key={b.id}
                  href={href(b.id)}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    b.id === selectedId
                      ? "border-brand-600 bg-brand-600 text-white shadow"
                      : "border-slate-200 bg-white text-slate-600 hover:border-brand-600"
                  }`}
                >
                  {b.name}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

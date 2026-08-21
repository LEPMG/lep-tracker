"use client";

import { useRouter } from "next/navigation";

/** One row per well — the raw data the cascading options are derived from. */
export interface FilterRow {
  state: string | null;
  county: string | null;
  field: string | null;
}

function uniq(values: (string | null)[]): string[] {
  return Array.from(
    new Set(values.filter((v): v is string => !!v && v.trim() !== ""))
  ).sort();
}

export function WellFilters({
  basePath,
  rows,
  state,
  county,
  field,
  count,
  extra = {},
}: {
  basePath: string;
  rows: FilterRow[];
  state: string;
  county: string;
  field: string;
  count: number;
  extra?: Record<string, string>;
}) {
  const router = useRouter();

  // Each dropdown only offers values that exist under the choices above it.
  const inState = (r: FilterRow, s: string) => !s || r.state === s;
  const inCounty = (r: FilterRow, c: string) => !c || r.county === c;

  const states = uniq(rows.map((r) => r.state));
  const counties = uniq(
    rows.filter((r) => inState(r, state)).map((r) => r.county)
  );
  const fields = uniq(
    rows
      .filter((r) => inState(r, state) && inCounty(r, county))
      .map((r) => r.field)
  );

  function go(next: { state?: string; county?: string; field?: string }) {
    const s = next.state ?? state;
    let c = next.county ?? county;
    let f = next.field ?? field;

    // Drop a narrower choice that no longer exists under the new wider one.
    if (c && !rows.some((r) => inState(r, s) && r.county === c)) c = "";
    if (
      f &&
      !rows.some((r) => inState(r, s) && inCounty(r, c) && r.field === f)
    ) {
      f = "";
    }

    const params = new URLSearchParams({ ...extra });
    if (s) params.set("state", s);
    if (c) params.set("county", c);
    if (f) params.set("field", f);
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  const hasFilter = state || county || field;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Filter
      </span>
      <select
        value={state}
        onChange={(e) => go({ state: e.target.value })}
        className="input !w-auto !py-1.5 text-sm"
      >
        <option value="">All states</option>
        {states.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select
        value={county}
        onChange={(e) => go({ county: e.target.value })}
        className="input !w-auto !py-1.5 text-sm"
      >
        <option value="">All counties</option>
        {counties.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <select
        value={field}
        onChange={(e) => go({ field: e.target.value })}
        className="input !w-auto !py-1.5 text-sm"
      >
        <option value="">All fields</option>
        {fields.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
      {hasFilter && (
        <button
          onClick={() => router.push(basePath)}
          className="text-xs font-medium text-brand-700"
        >
          Clear
        </button>
      )}
      <span className="ml-auto text-xs text-slate-400">{count} shown</span>
    </div>
  );
}

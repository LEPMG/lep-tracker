"use client";

import { useRouter } from "next/navigation";

/**
 * One row of the filterable universe — the raw data the cascading options are
 * derived from. Pages build these from whatever they show (wells, batteries,
 * or the union of both), so new states/fields/batteries appear on their own.
 */
export interface FilterRow {
  state: string | null;
  county: string | null;
  field: string | null;
  battery?: string | null;
}

function uniq(values: (string | null | undefined)[]): string[] {
  return Array.from(
    new Set(values.filter((v): v is string => !!v && v.trim() !== ""))
  ).sort();
}

/**
 * Cascading page filter: State > County > Field > Battery. Each dropdown only
 * offers values that exist under the choices above it, and picking a wider
 * value clears any narrower one that no longer applies.
 *
 * The battery dropdown only renders when the page passes a `battery` value —
 * pages that filter wells alone (e.g. Down Wells) just omit it.
 */
export function PageFilters({
  basePath,
  rows,
  state,
  county,
  field,
  battery,
  count,
  extra = {},
}: {
  basePath: string;
  rows: FilterRow[];
  state: string;
  county: string;
  field: string;
  battery?: string;
  count?: number;
  extra?: Record<string, string>;
}) {
  const router = useRouter();
  const showBattery = battery !== undefined;

  const inState = (r: FilterRow, s: string) => !s || r.state === s;
  const inCounty = (r: FilterRow, c: string) => !c || r.county === c;
  const inField = (r: FilterRow, f: string) => !f || r.field === f;

  const states = uniq(rows.map((r) => r.state));
  const counties = uniq(
    rows.filter((r) => inState(r, state)).map((r) => r.county)
  );
  const fields = uniq(
    rows
      .filter((r) => inState(r, state) && inCounty(r, county))
      .map((r) => r.field)
  );
  const batteries = uniq(
    rows
      .filter(
        (r) => inState(r, state) && inCounty(r, county) && inField(r, field)
      )
      .map((r) => r.battery)
  );

  function go(next: {
    state?: string;
    county?: string;
    field?: string;
    battery?: string;
  }) {
    const s = next.state ?? state;
    let c = next.county ?? county;
    let f = next.field ?? field;
    let bt = next.battery ?? battery ?? "";

    // Drop a narrower choice that no longer exists under the new wider one.
    if (c && !rows.some((r) => inState(r, s) && r.county === c)) c = "";
    if (
      f &&
      !rows.some((r) => inState(r, s) && inCounty(r, c) && r.field === f)
    ) {
      f = "";
    }
    if (
      bt &&
      !rows.some(
        (r) =>
          inState(r, s) &&
          inCounty(r, c) &&
          inField(r, f) &&
          r.battery === bt
      )
    ) {
      bt = "";
    }

    const params = new URLSearchParams({ ...extra });
    if (s) params.set("state", s);
    if (c) params.set("county", c);
    if (f) params.set("field", f);
    if (bt) params.set("battery", bt);
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  const hasFilter = state || county || field || battery;

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
      {showBattery && (
        <select
          value={battery}
          onChange={(e) => go({ battery: e.target.value })}
          className="input !w-auto !py-1.5 text-sm"
        >
          <option value="">All batteries</option>
          {batteries.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      )}
      {hasFilter && (
        <button
          onClick={() => router.push(basePath)}
          className="text-xs font-medium text-brand-700"
        >
          Clear
        </button>
      )}
      {count !== undefined && (
        <span className="ml-auto text-xs text-slate-400">{count} shown</span>
      )}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";

export function WellFilters({
  basePath,
  states,
  fields,
  state,
  field,
  count,
  extra = {},
}: {
  basePath: string;
  states: string[];
  fields: string[];
  state: string;
  field: string;
  count: number;
  extra?: Record<string, string>;
}) {
  const router = useRouter();

  function go(next: { state?: string; field?: string }) {
    const params = new URLSearchParams({ ...extra });
    const s = next.state ?? state;
    const f = next.field ?? field;
    if (s) params.set("state", s);
    if (f) params.set("field", f);
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  const hasFilter = state || field;

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

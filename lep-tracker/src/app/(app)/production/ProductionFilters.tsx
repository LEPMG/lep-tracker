"use client";

import { useRouter } from "next/navigation";

export interface BatteryOption {
  id: string;
  name: string;
  state: string | null;
  field: string | null;
}

function uniq(values: (string | null)[]): string[] {
  return Array.from(
    new Set(values.filter((v): v is string => !!v && v.trim() !== ""))
  ).sort();
}

/**
 * Cascading State > Field > Battery selector, replacing the flat battery
 * pills. State narrows Field, Field narrows Battery. Options are derived from
 * the battery rows themselves, so a new state or field needs no code change.
 *
 * Only `battery` actually loads data; state/field ride along in the URL so the
 * dropdowns stay where the user left them. Narrowing to a state/field whose
 * batteries exclude the current one hands off to the first battery that fits.
 */
export function ProductionFilters({
  batteries,
  state,
  field,
  batteryId,
  range,
}: {
  batteries: BatteryOption[];
  state: string;
  field: string;
  batteryId: string;
  range: string;
}) {
  const router = useRouter();

  const inState = (b: BatteryOption, s: string) => !s || b.state === s;
  const inField = (b: BatteryOption, f: string) => !f || b.field === f;

  const states = uniq(batteries.map((b) => b.state));
  const fields = uniq(
    batteries.filter((b) => inState(b, state)).map((b) => b.field)
  );
  const visible = batteries.filter(
    (b) => inState(b, state) && inField(b, field)
  );

  function go(next: { state?: string; field?: string; battery?: string }) {
    const s = next.state ?? state;
    let f = next.field ?? field;
    let id = next.battery ?? batteryId;

    // Drop a narrower choice that no longer exists under the new wider one.
    if (f && !batteries.some((b) => inState(b, s) && b.field === f)) f = "";

    // Keep the loaded battery only if it still lives under the new scope;
    // otherwise fall through to the first one that does.
    const scoped = batteries.filter((b) => inState(b, s) && inField(b, f));
    if (!scoped.some((b) => b.id === id)) id = scoped[0]?.id ?? "";

    const params = new URLSearchParams();
    if (s) params.set("state", s);
    if (f) params.set("field", f);
    if (id) params.set("battery", id);
    if (range) params.set("range", range);
    router.push(`/production?${params.toString()}`);
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Battery
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
      <select
        value={batteryId}
        onChange={(e) => go({ battery: e.target.value })}
        className="input !w-auto !py-1.5 text-sm font-medium"
      >
        {visible.length === 0 && <option value="">— no batteries —</option>}
        {visible.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      {(state || field) && (
        <button
          onClick={() => go({ state: "", field: "" })}
          className="text-xs font-medium text-brand-700"
        >
          Clear
        </button>
      )}
    </div>
  );
}

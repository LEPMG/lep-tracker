"use client";

import { useState } from "react";

interface WellOpt {
  id: string;
  name: string;
  test_oil_bopd: number | null;
  test_water_bwpd: number | null;
  test_gas_mcfd: number | null;
}

export default function ReportDownForm({
  wells,
  users,
  action,
}: {
  wells: WellOpt[];
  users: { id: string; name: string }[];
  action: (formData: FormData) => void;
}) {
  const [selected, setSelected] = useState<WellOpt | null>(null);
  const [oilLoss, setOilLoss] = useState("");

  function onPickWell(id: string) {
    const w = wells.find((x) => x.id === id) || null;
    setSelected(w);
    // auto-fill the estimated oil loss from the well's test
    setOilLoss(w?.test_oil_bopd != null ? String(w.test_oil_bopd) : "");
  }

  return (
    <details className="relative">
      <summary className="btn-primary cursor-pointer list-none">
        + Report Down Well
      </summary>
      <form
        action={action}
        className="card absolute right-0 z-20 mt-2 w-96 space-y-3 p-4"
      >
        <div>
          <label className="label">Well</label>
          <select
            name="well_id"
            className="input"
            required
            onChange={(e) => onPickWell(e.target.value)}
          >
            <option value="">— select well —</option>
            {wells.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>

        {selected && (
          <div className="rounded-md bg-brand-50 px-3 py-2 text-xs text-brand-800">
            Well test:{" "}
            <b>{selected.test_oil_bopd != null ? selected.test_oil_bopd : "—"}</b>{" "}
            BOPD ·{" "}
            <b>
              {selected.test_water_bwpd != null ? selected.test_water_bwpd : "—"}
            </b>{" "}
            BWPD ·{" "}
            <b>{selected.test_gas_mcfd != null ? selected.test_gas_mcfd : "—"}</b>{" "}
            MCFD
            {selected.test_oil_bopd == null && (
              <div className="mt-1 text-amber-700">
                No oil test on this well — enter an estimate below.
              </div>
            )}
          </div>
        )}

        <div>
          <label className="label">Reason down *</label>
          <input
            name="reason"
            className="input"
            placeholder="Rod parted, pump change, power out…"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Category</label>
            <select name="category" className="input">
              <option value="">—</option>
              <option>Mechanical</option>
              <option>Electrical</option>
              <option>Facility</option>
              <option>Weather</option>
              <option>Other</option>
            </select>
          </div>
          <div>
            <label className="label">Est. BOPD loss</label>
            <input
              name="est_bopd_loss"
              type="number"
              step="any"
              className="input"
              value={oilLoss}
              onChange={(e) => setOilLoss(e.target.value)}
              placeholder="auto-fills from well test"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Down since</label>
            <input name="start_at" type="datetime-local" className="input" />
          </div>
          <div>
            <label className="label">Owner</label>
            <select name="owner_id" className="input">
              <option value="">Me</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button className="btn-primary w-full">Report down</button>
      </form>
    </details>
  );
}

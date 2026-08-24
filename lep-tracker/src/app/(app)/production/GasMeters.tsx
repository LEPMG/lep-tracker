// Placeholder card — shows the intended gas-meter entry layout.
// Inputs are disabled on purpose; wiring + storage come in a later change.
export function GasMeters() {
  return (
    <div className="card h-fit p-4 opacity-90">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="font-semibold">Gas Meters</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Coming soon
        </span>
      </div>
      <p className="mb-3 text-xs text-slate-400">
        Preview of the meter-reading entry. Gas meters aren&apos;t set up for
        these batteries yet — nothing here is saved. We&apos;ll wire this up
        next.
      </p>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Meter</label>
            <input className="input" placeholder="Meter name/ID" disabled />
          </div>
          <div>
            <label className="label">Reading date</label>
            <input type="date" className="input" disabled />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Meter reading (MCF)</label>
            <input type="number" className="input" placeholder="0" disabled />
          </div>
          <div>
            <label className="label">MCFD</label>
            <input className="input" placeholder="auto" disabled />
          </div>
        </div>
        <button className="btn-primary w-full" disabled>
          Save meter reading
        </button>
      </div>
    </div>
  );
}

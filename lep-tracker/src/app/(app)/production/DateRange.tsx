"use client";
import Link from "next/link";

const OPTS = [
  { key: "7", label: "7d" },
  { key: "30", label: "30d" },
  { key: "90", label: "90d" },
  { key: "month", label: "This month" },
  { key: "all", label: "All" },
];

export function DateRange({
  batteryId,
  range,
}: {
  batteryId: string;
  range: string;
}) {
  return (
    <div className="inline-flex flex-wrap rounded-xl border border-slate-200 bg-white p-1">
      {OPTS.map((o) => (
        <Link
          key={o.key}
          href={`/production?battery=${batteryId}&range=${o.key}`}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
            range === o.key
              ? "bg-brand-600 text-white"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

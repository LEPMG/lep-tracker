import Link from "next/link";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  tone = "default",
  href,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: "default" | "danger" | "warn" | "good";
  href?: string;
}) {
  const toneClass =
    tone === "danger"
      ? "text-red-600"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "good"
          ? "text-emerald-600"
          : "text-slate-900";
  const inner = (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

const BADGE_TONES: Record<string, string> = {
  UP: "bg-emerald-100 text-emerald-700",
  DOWN: "bg-red-100 text-red-700",
  SHUT_IN: "bg-amber-100 text-amber-700",
  INACTIVE: "bg-slate-100 text-slate-500",
  OPEN: "bg-red-100 text-red-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  ON_HOLD: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-slate-100 text-slate-500",
  RESOLVED: "bg-emerald-100 text-emerald-700",
  LOW: "bg-slate-100 text-slate-600",
  MEDIUM: "bg-blue-100 text-blue-700",
  HIGH: "bg-amber-100 text-amber-700",
  URGENT: "bg-red-100 text-red-700",
};

export function Badge({ value }: { value: string }) {
  const tone = BADGE_TONES[value] || "bg-slate-100 text-slate-600";
  return <span className={`badge ${tone}`}>{value.replace(/_/g, " ")}</span>;
}

export function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="text-sm font-semibold text-slate-700">{title}</div>
      {hint && <div className="mt-1 text-sm text-slate-400">{hint}</div>}
    </div>
  );
}

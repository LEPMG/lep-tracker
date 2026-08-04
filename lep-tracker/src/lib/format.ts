export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function fmtNum(n: number | null | undefined, digits = 1): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Duration between a start and (end|now) as "3d 4h". */
export function durationSince(
  start: Date | string,
  end?: Date | string | null
): string {
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  let mins = Math.max(0, Math.floor((e - s) / 60000));
  const days = Math.floor(mins / 1440);
  mins -= days * 1440;
  const hours = Math.floor(mins / 60);
  if (days > 0) return `${days}d ${hours}h`;
  const m = mins - hours * 60;
  return `${hours}h ${m}m`;
}

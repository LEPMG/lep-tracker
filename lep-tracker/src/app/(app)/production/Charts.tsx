"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";

const BRAND = "#1d4ed8";

// catmull-rom -> smooth bezier path
function smoothPath(pts: [number, number][]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0][0]} ${pts[0][1]}`;
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

/** Small inline sparkline — smooth line + soft gradient fill. Scales to width. */
export function Sparkline({
  values,
  color = BRAND,
  height = 54,
}: {
  values: number[];
  color?: string;
  height?: number;
}) {
  const gid = useId();
  const W = 220;
  const H = height;
  if (values.length === 0)
    return <div style={{ height: H }} className="text-xs text-slate-400">no data</div>;
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  const rng = mx - mn || 1;
  const X = (i: number) => 5 + i * ((W - 10) / Math.max(1, values.length - 1));
  const Y = (v: number) => H - 7 - ((v - mn) / rng) * (H - 14);
  const pts = values.map((v, i) => [X(i), Y(v)] as [number, number]);
  const line = smoothPath(pts);
  const area = `${line} L${X(values.length - 1).toFixed(1)} ${H} L${X(0).toFixed(1)} ${H} Z`;
  return (
    <svg
      width="100%"
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="mt-2 block"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.26" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Responsive line chart with smooth curve, gradient fill, and touch/mouse tooltip. */
export function LineChart({
  points,
  height = 210,
  unit = "",
  color = BRAND,
}: {
  points: { label: string; value: number }[];
  height?: number;
  unit?: string;
  color?: string;
}) {
  const gid = useId();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hi, setHi] = useState<number | null>(null);

  const W = 640;
  const H = height;
  const L = 30;
  const R = 16;
  const T = 16;
  const B = 26;

  if (points.length === 0)
    return (
      <div className="flex h-40 items-center justify-center text-sm text-slate-400">
        Not enough gaugings yet to trend.
      </div>
    );

  const vals = points.map((p) => p.value);
  const mx = Math.max(5, Math.ceil(Math.max(...vals) / 5) * 5);
  const X = (i: number) => L + i * ((W - L - R) / Math.max(1, points.length - 1));
  const Y = (v: number) => T + (1 - v / mx) * (H - T - B);
  const pts = points.map((p, i) => [X(i), Y(p.value)] as [number, number]);
  const line = smoothPath(pts);
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${H - B} L${pts[0][0].toFixed(1)} ${H - B} Z`;

  const grid: number[] = [];
  for (let g = 0; g <= mx; g += mx / 4) grid.push(g);

  const lastX = pts[pts.length - 1][0];
  const lastY = pts[pts.length - 1][1];

  function onMove(clientX: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(X(i) - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setHi(best);
  }

  const tickIdx =
    points.length <= 6
      ? points.map((_, i) => i)
      : [0, 0.2, 0.4, 0.6, 0.8, 1].map((f) =>
          Math.round(f * (points.length - 1))
        );

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ height: "auto", display: "block", touchAction: "none" }}
        onMouseMove={(e) => onMove(e.clientX)}
        onMouseLeave={() => setHi(null)}
        onTouchStart={(e) => onMove(e.touches[0].clientX)}
        onTouchMove={(e) => onMove(e.touches[0].clientX)}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.22" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {grid.map((g, i) => (
          <g key={i}>
            <line
              x1={L}
              y1={Y(g).toFixed(1)}
              x2={W - R}
              y2={Y(g).toFixed(1)}
              stroke="#eef2f7"
              strokeWidth={1}
            />
            <text x={2} y={Y(g) + 3} fontSize={10} fill="#898781">
              {Math.round(g)}
            </text>
          </g>
        ))}
        <path d={area} fill={`url(#${gid})`} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {tickIdx.map((i) => (
          <text
            key={i}
            x={X(i)}
            y={H - 7}
            fontSize={10}
            fill="#898781"
            textAnchor="middle"
          >
            {points[i].label}
          </text>
        ))}
        {/* emphasized last point (when not hovering) */}
        {hi === null && (
          <>
            <circle cx={lastX} cy={lastY} r={8} fill={color} opacity={0.15} />
            <circle
              cx={lastX}
              cy={lastY}
              r={3.5}
              fill={color}
              stroke="#fff"
              strokeWidth={1.5}
            />
          </>
        )}
        {/* hover marker */}
        {hi !== null && (
          <>
            <line
              x1={X(hi)}
              y1={T}
              x2={X(hi)}
              y2={H - B}
              stroke={color}
              strokeOpacity={0.35}
              strokeWidth={1}
            />
            <circle
              cx={X(hi)}
              cy={Y(points[hi].value)}
              r={4}
              fill={color}
              stroke="#fff"
              strokeWidth={1.5}
            />
          </>
        )}
      </svg>
      {hi !== null && (
        <div
          className="pointer-events-none absolute -top-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold shadow-sm"
          style={{
            left: `${(X(hi) / W) * 100}%`,
            transform: "translateX(-50%)",
          }}
        >
          <span className="text-slate-500">{points[hi].label} · </span>
          <span style={{ color }}>
            {points[hi].value.toFixed(1)}
            {unit}
          </span>
        </div>
      )}
    </div>
  );
}

const RANGES = [
  { key: "7", label: "7d" },
  { key: "30", label: "30d" },
  { key: "90", label: "90d" },
  { key: "month", label: "Month" },
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
    <div className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
      {RANGES.map((o) => (
        <Link
          key={o.key}
          href={`/production?battery=${batteryId}&range=${o.key}`}
          scroll={false}
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

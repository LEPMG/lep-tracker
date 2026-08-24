import { fmtDate, fmtNum } from "@/lib/format";

export interface TrendPoint {
  date: Date;
  bopd: number;
  bwpd: number;
}

// Same two colors the computed-production table already uses for these
// measures, so the chart and the table read as one thing. Both series are
// bbls/day, so they share a single y-axis.
const OIL = "#059669"; // emerald-600 — BOPD
const WATER = "#2563eb"; // blue-600 — BWPD

const W = 760;
const H = 240;
const PAD_L = 52;
const PAD_R = 64;
const PAD_T = 14;
const PAD_B = 34;

/**
 * Lightweight inline-SVG trend of BOPD / BWPD across the selected range.
 * No chart library — this is a handful of scaled points and two polylines.
 */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  if (points.length < 2) {
    return (
      <div className="card p-6 text-center text-sm text-slate-400">
        Not enough gaugings in this range to draw a trend — pick a wider range.
      </div>
    );
  }

  const xs = points.map((p) => p.date.getTime());
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const values = points.flatMap((p) => [p.bopd, p.bwpd]);
  // Rates are a magnitude, so anchor to zero unless production went negative.
  const yMin = Math.min(0, ...values);
  const yMaxRaw = Math.max(...values, 1);
  const yMax = yMaxRaw + (yMaxRaw - yMin) * 0.12; // headroom for point labels

  const x = (t: number) =>
    xMax === xMin
      ? PAD_L
      : PAD_L + ((t - xMin) / (xMax - xMin)) * (W - PAD_L - PAD_R);
  const y = (v: number) =>
    H - PAD_B - ((v - yMin) / (yMax - yMin || 1)) * (H - PAD_T - PAD_B);

  const line = (key: "bopd" | "bwpd") =>
    points.map((p) => `${x(p.date.getTime())},${y(p[key])}`).join(" ");

  // 5 horizontal gridlines, and date ticks at either end plus the middle.
  const gridVals = [0, 0.25, 0.5, 0.75, 1].map((f) => yMin + (yMax - yMin) * f);
  const tickIdx = Array.from(
    new Set([0, Math.floor(points.length / 2), points.length - 1])
  );

  const last = points[points.length - 1];

  // Direct labels sit on the last point of each series. When the two rates are
  // close the labels overlap into a smear, so nudge them apart to a minimum gap
  // (and keep them inside the viewBox).
  const LABEL_GAP = 13;
  let oilLabelY = y(last.bopd);
  let waterLabelY = y(last.bwpd);
  if (Math.abs(oilLabelY - waterLabelY) < LABEL_GAP) {
    const mid = (oilLabelY + waterLabelY) / 2;
    const oilOnTop = oilLabelY <= waterLabelY;
    oilLabelY = mid + (oilOnTop ? -LABEL_GAP / 2 : LABEL_GAP / 2);
    waterLabelY = mid + (oilOnTop ? LABEL_GAP / 2 : -LABEL_GAP / 2);
  }
  const clampY = (v: number) => Math.min(H - 4, Math.max(PAD_T + 8, v));
  oilLabelY = clampY(oilLabelY);
  waterLabelY = clampY(waterLabelY);

  return (
    <div className="card p-4">
      <div className="mb-2 flex flex-wrap items-center gap-4">
        <LegendKey color={OIL} label="BOPD (oil)" />
        <LegendKey color={WATER} label="BWPD (water)" />
        <span className="ml-auto text-xs text-slate-400">
          {points.length} periods · {fmtDate(points[0].date)} →{" "}
          {fmtDate(last.date)}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`BOPD and BWPD trend, ${fmtDate(points[0].date)} to ${fmtDate(last.date)}`}
      >
        {/* gridlines + y labels (recessive) */}
        {gridVals.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={y(v)}
              y2={y(v)}
              stroke="#f1f5f9"
              strokeWidth="1"
            />
            <text
              x={PAD_L - 8}
              y={y(v) + 4}
              textAnchor="end"
              fontSize="11"
              fill="#94a3b8"
            >
              {fmtNum(v, 0)}
            </text>
          </g>
        ))}

        {/* zero line, when the range dips negative */}
        {yMin < 0 && (
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={y(0)}
            y2={y(0)}
            stroke="#cbd5e1"
            strokeWidth="1"
          />
        )}

        {/* x ticks */}
        {tickIdx.map((i) => (
          <text
            key={i}
            x={x(points[i].date.getTime())}
            y={H - PAD_B + 18}
            textAnchor={
              i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"
            }
            fontSize="11"
            fill="#94a3b8"
          >
            {fmtDate(points[i].date)}
          </text>
        ))}

        <polyline
          points={line("bwpd")}
          fill="none"
          stroke={WATER}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <polyline
          points={line("bopd")}
          fill="none"
          stroke={OIL}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* markers — 2px surface ring keeps them legible where lines cross */}
        {points.map((p, i) => (
          <g key={i}>
            <circle
              cx={x(p.date.getTime())}
              cy={y(p.bwpd)}
              r="4"
              fill={WATER}
              stroke="#fff"
              strokeWidth="2"
            />
            <circle
              cx={x(p.date.getTime())}
              cy={y(p.bopd)}
              r="4"
              fill={OIL}
              stroke="#fff"
              strokeWidth="2"
            />
            {/* wide invisible hit target -> native hover tooltip, no JS */}
            <circle
              cx={x(p.date.getTime())}
              cy={(y(p.bopd) + y(p.bwpd)) / 2}
              r="14"
              fill="transparent"
            >
              <title>
                {`${fmtDate(p.date)} — BOPD ${fmtNum(p.bopd, 1)}, BWPD ${fmtNum(p.bwpd, 1)}`}
              </title>
            </circle>
          </g>
        ))}

        {/* direct labels on the latest point (2 series -> label both) */}
        <text
          x={x(last.date.getTime()) + 10}
          y={oilLabelY + 4}
          fontSize="11"
          fontWeight="600"
          fill="#047857"
        >
          {fmtNum(last.bopd, 1)}
        </text>
        <text
          x={x(last.date.getTime()) + 10}
          y={waterLabelY + 4}
          fontSize="11"
          fontWeight="600"
          fill="#1d4ed8"
        >
          {fmtNum(last.bwpd, 1)}
        </text>
      </svg>
    </div>
  );
}

function LegendKey({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-600">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

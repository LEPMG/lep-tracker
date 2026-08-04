import {
  gaugeToBarrels,
  toTotalInches,
  computeDailyProduction,
} from "../src/lib/gauge";

let failures = 0;
function assert(name: string, got: number, want: number, tol = 0.01) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: got ${got}, want ${want}`);
}

// --- unit conversions ------------------------------------------------------
assert("8ft 6in -> inches", toTotalInches(8, 6), 102);
// Tank with 1.87 bbls/inch, gauged at 8'6" (102") => 190.74 bbls
assert("gauge->bbls", gaugeToBarrels(8, 6, 1.87), 190.74);

// --- production reconciliation ---------------------------------------------
// One oil tank (1.87 bbl/in), one water tank (1.50 bbl/in).
// Day 1: oil at 5'0" (60") = 112.2 bbls; water at 3'0" (36") = 54 bbls
// Day 2 (next day): oil at 8'0" (96") = 179.52; water at 4'0"(48")=72
// Between them a run ticket sold 0 bbls. So:
//   oil produced = 179.52 - 112.2 = 67.32 over 1 day -> BOPD 67.32
//   water produced = 72 - 54 = 18 -> BWPD 18
const d1 = new Date("2026-01-01T06:00:00Z");
const d2 = new Date("2026-01-02T06:00:00Z");
const oil = (b: number) => ({ type: "OIL" as const, barrels: b });
const water = (b: number) => ({ type: "WATER" as const, barrels: b });

let p = computeDailyProduction(
  [
    { date: d1, tanks: [oil(112.2), water(54)] },
    { date: d2, tanks: [oil(179.52), water(72)] },
  ],
  []
);
assert("BOPD no-sale", p[0].bopd, 67.32);
assert("BWPD no-sale", p[0].bwpd, 18);

// Now add an oil sale of 150 bbls on day 2 (tank was drawn down):
// Day 2 oil now reads lower because 150 were hauled. Say oil reads 2'0"(24") = 44.88
//   oil produced = (44.88 - 112.2) + 150 = 82.68 over 1 day
p = computeDailyProduction(
  [
    { date: d1, tanks: [oil(112.2), water(54)] },
    { date: d2, tanks: [oil(44.88), water(72)] },
  ],
  [{ date: d2, type: "OIL_SALE", gross: 150, net: 150 }]
);
assert("BOPD with 150bbl sale", p[0].bopd, 82.68);

// Multi-day gap: 3 days between gaugings, oil rose 300 bbls, no sales
const d5 = new Date("2026-01-05T06:00:00Z");
p = computeDailyProduction(
  [
    { date: d2, tanks: [oil(0)] },
    { date: d5, tanks: [oil(300)] },
  ],
  []
);
assert("BOPD over 3 days", p[0].bopd, 100);
assert("days counted", p[0].days, 3);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);

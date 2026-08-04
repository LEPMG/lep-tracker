// ===========================================================================
// Tank-gauge production engine
// ---------------------------------------------------------------------------
// Pumpers gauge tanks (a fluid height), not barrels. This module converts a
// gauge to barrels and reconstructs daily production (BOPD / BWPD) from the
// change in tank level between two gaugings plus whatever was hauled/sold in
// between.
//
// The core reconciliation a pumper does by hand:
//
//   Oil produced (period)  = (oil bbls now - oil bbls last time) + oil sold
//   Water produced (period)= (water bbls now - water bbls last time) + water hauled
//   BOPD = oil produced / days between gaugings
//   BWPD = water produced / days between gaugings
//
// Selling/hauling *lowers* the tank, so we add it back to recover what the
// well actually made. Oil sales come from oil run tickets; water hauls from
// water run tickets.
// ===========================================================================

export type TankKind = "OIL" | "WATER" | "GAS_COND";

/** feet + inches -> total inches of gauge. */
export function toTotalInches(feet: number, inches: number): number {
  return feet * 12 + inches;
}

/** total inches * (barrels per inch) -> barrels in the tank. */
export function barrelsFromInches(
  totalInches: number,
  bblsPerInch: number
): number {
  return round2(totalInches * bblsPerInch);
}

/** Convenience: feet/inches straight to barrels for one tank. */
export function gaugeToBarrels(
  feet: number,
  inches: number,
  bblsPerInch: number
): number {
  return barrelsFromInches(toTotalInches(feet, inches), bblsPerInch);
}

export interface TankReadingLite {
  type: TankKind;
  barrels: number;
}

export interface ReadingLite {
  date: Date;
  tanks: TankReadingLite[];
}

export interface TicketLite {
  date: Date;
  type: "OIL_SALE" | "WATER_HAUL";
  gross: number;
  net?: number | null;
}

export interface ProductionPeriod {
  fromDate: Date;
  toDate: Date;
  days: number;
  oilProducedBbls: number;
  waterProducedBbls: number;
  oilSoldBbls: number;
  waterHauledBbls: number;
  bopd: number;
  bwpd: number;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function sumBarrels(tanks: TankReadingLite[], kinds: TankKind[]): number {
  return tanks
    .filter((t) => kinds.includes(t.type))
    .reduce((s, t) => s + t.barrels, 0);
}

/**
 * Reconstruct per-period production from a battery's ordered gauge readings
 * and its run tickets. Returns one row per gap between consecutive readings.
 * The first reading establishes a baseline and produces no period on its own.
 */
export function computeDailyProduction(
  readings: ReadingLite[],
  tickets: TicketLite[]
): ProductionPeriod[] {
  const sorted = [...readings].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
  const periods: ProductionPeriod[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];

    const days = Math.max(
      1,
      Math.round((curr.date.getTime() - prev.date.getTime()) / MS_PER_DAY)
    );

    // Oil tanks (condensate counts as oil-side liquid).
    const oilPrev = sumBarrels(prev.tanks, ["OIL", "GAS_COND"]);
    const oilCurr = sumBarrels(curr.tanks, ["OIL", "GAS_COND"]);
    const waterPrev = sumBarrels(prev.tanks, ["WATER"]);
    const waterCurr = sumBarrels(curr.tanks, ["WATER"]);

    // Tickets strictly after the prior gauge, up to and including this gauge.
    const inWindow = tickets.filter(
      (t) =>
        t.date.getTime() > prev.date.getTime() &&
        t.date.getTime() <= curr.date.getTime()
    );
    const oilSold = inWindow
      .filter((t) => t.type === "OIL_SALE")
      .reduce((s, t) => s + (t.net ?? t.gross), 0);
    const waterHauled = inWindow
      .filter((t) => t.type === "WATER_HAUL")
      .reduce((s, t) => s + t.gross, 0);

    const oilProduced = oilCurr - oilPrev + oilSold;
    const waterProduced = waterCurr - waterPrev + waterHauled;

    periods.push({
      fromDate: prev.date,
      toDate: curr.date,
      days,
      oilProducedBbls: round2(oilProduced),
      waterProducedBbls: round2(waterProduced),
      oilSoldBbls: round2(oilSold),
      waterHauledBbls: round2(waterHauled),
      bopd: round2(oilProduced / days),
      bwpd: round2(waterProduced / days),
    });
  }

  return periods;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

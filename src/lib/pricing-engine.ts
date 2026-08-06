import type { BarPeriod, HistoricalDataPoint, Season, PricingResult, RoomId } from "@/types";
import { BAR_RATES_TABLE } from "@/data/bar-table";
import { HISTORICAL_DATA } from "@/data/historical-calendar";
import { ROOMS } from "@/data/rooms";

export type PricingOptions = {
  pax?: 1 | 2;
  breakfast?: boolean;
};

// Map BAR level → season classification
export function barToSeason(barLevel: number): Season {
  if (barLevel <= 2) return "alta";
  if (barLevel <= 4) return "media";
  if (barLevel <= 6) return "normal";
  return "baixa";
}

// Infer BAR level from historical data for a given month
function getHistoricalBarForDate(dateISO: string): number | null {
  // Try exact date match first
  const exact = HISTORICAL_DATA.find((d) => d.date === dateISO);
  if (exact) return exact.barLevel;

  // Try same month-day pattern from any year (seasonal inference)
  const [, monthStr, dayStr] = dateISO.split("-");
  const monthDay = `${monthStr}-${dayStr}`;
  const matches = HISTORICAL_DATA.filter((d) => d.date.endsWith(monthDay));
  if (matches.length > 0) {
    const avg = matches.reduce((s, d) => s + d.barLevel, 0) / matches.length;
    return Math.round(avg);
  }

  // Fallback: month-based average
  const month = parseInt(monthStr, 10);
  const monthMatches = HISTORICAL_DATA.filter((d) => d.month === month);
  if (monthMatches.length > 0) {
    const avg = monthMatches.reduce((s, d) => s + d.barLevel, 0) / monthMatches.length;
    return Math.round(avg);
  }

  return null;
}

export function getRatesForRoom(
  roomId: string,
  barLevel: number,
  options: PricingOptions = {}
): { without_breakfast_1pax: number; without_breakfast_2pax: number; with_breakfast_1pax: number; with_breakfast_2pax: number } | null {
  const roomRates = (BAR_RATES_TABLE as Record<string, Record<string, Record<string, number>>>)[roomId];
  if (!roomRates) return null;

  const barStr = String(barLevel);
  const rates = roomRates[barStr];
  if (!rates) return null;

  return {
    without_breakfast_1pax: rates["sem_cafe_1pax"] ?? 0,
    without_breakfast_2pax: rates["sem_cafe_2pax"] ?? 0,
    with_breakfast_1pax: rates["com_cafe_1pax"] ?? 0,
    with_breakfast_2pax: rates["com_cafe_2pax"] ?? 0,
  };
}

export function getPriceForDate(
  roomId: string,
  dateISO: string,
  options: PricingOptions = {},
  barPeriods: BarPeriod[] = []
): { price: number; barLevel: number; barSource: "firestore" | "historical" | "default"; season: Season } {
  let barLevel: number;
  let barSource: "firestore" | "historical" | "default";

  // 1. Check Firestore bar_periods (passed in)
  const matchingPeriod = barPeriods.find(
    (p) => dateISO >= p.startDate && dateISO <= p.endDate
  );
  if (matchingPeriod) {
    barLevel = matchingPeriod.barLevel;
    barSource = "firestore";
  } else {
    // 2. Infer from historical data
    const historicalBar = getHistoricalBarForDate(dateISO);
    if (historicalBar !== null) {
      barLevel = historicalBar;
      barSource = "historical";
    } else {
      // 3. Default: BAR 5
      barLevel = 5;
      barSource = "default";
    }
  }

  const rates = getRatesForRoom(roomId, barLevel, options);
  const { pax = 1, breakfast = false } = options;

  let price = 0;
  if (rates) {
    if (breakfast) {
      price = pax === 2 ? rates.with_breakfast_2pax : rates.with_breakfast_1pax;
    } else {
      price = pax === 2 ? rates.without_breakfast_2pax : rates.without_breakfast_1pax;
    }
  }

  return { price, barLevel, barSource, season: barToSeason(barLevel) };
}

export function getPricingForAllRooms(
  dateISO: string,
  options: PricingOptions = {},
  barPeriods: BarPeriod[] = []
): PricingResult[] {
  return ROOMS.map((room) => {
    const { price, barLevel, barSource, season } = getPriceForDate(
      room.id,
      dateISO,
      options,
      barPeriods
    );
    const allRates = getRatesForRoom(room.id, barLevel);

    return {
      roomId: room.id as RoomId,
      roomName: room.name,
      barLevel,
      barSource,
      season,
      prices: allRates ?? {
        without_breakfast_1pax: 0,
        without_breakfast_2pax: 0,
        with_breakfast_1pax: 0,
        with_breakfast_2pax: 0,
      },
    };
  });
}

export function getBarLevelForDate(
  dateISO: string,
  barPeriods: BarPeriod[] = []
): { barLevel: number; source: "firestore" | "historical" | "default"; season: Season } {
  const matchingPeriod = barPeriods.find(
    (p) => dateISO >= p.startDate && dateISO <= p.endDate
  );
  if (matchingPeriod) {
    return {
      barLevel: matchingPeriod.barLevel,
      source: "firestore",
      season: matchingPeriod.season,
    };
  }

  const historicalBar = getHistoricalBarForDate(dateISO);
  if (historicalBar !== null) {
    return { barLevel: historicalBar, source: "historical", season: barToSeason(historicalBar) };
  }

  return { barLevel: 5, source: "default", season: "normal" };
}

// Generate calendar data for a month
export function getMonthCalendarData(
  year: number,
  month: number,
  barPeriods: BarPeriod[] = []
): Array<{
  date: string;
  day: number;
  barLevel: number;
  source: string;
  season: Season;
  standardPrice: number;
}> {
  const daysInMonth = new Date(year, month, 0).getDate();
  const result = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateISO = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const { barLevel, source, season } = getBarLevelForDate(dateISO, barPeriods);
    const rates = getRatesForRoom("standard", barLevel);
    const standardPrice = rates?.without_breakfast_1pax ?? 0;

    result.push({ date: dateISO, day: d, barLevel, source, season, standardPrice });
  }

  return result;
}

// Season detection from historical data
export interface SeasonSummary {
  month: number;
  avgBarLevel: number;
  season: Season;
  sampleCount: number;
}

export function getSeasonalSummary(): SeasonSummary[] {
  const byMonth: Record<number, number[]> = {};

  for (const d of HISTORICAL_DATA) {
    if (!byMonth[d.month]) byMonth[d.month] = [];
    byMonth[d.month].push(d.barLevel);
  }

  return Object.entries(byMonth)
    .map(([m, levels]) => {
      const avg = levels.reduce((s, v) => s + v, 0) / levels.length;
      const rounded = Math.round(avg * 10) / 10;
      return {
        month: parseInt(m, 10),
        avgBarLevel: rounded,
        season: barToSeason(Math.round(rounded)),
        sampleCount: levels.length,
      };
    })
    .sort((a, b) => a.month - b.month);
}

// Get historical data for a specific date (for comparison)
export function getHistoricalPoint(dateISO: string): HistoricalDataPoint | undefined {
  return HISTORICAL_DATA.find((d) => d.date === dateISO);
}

// Available BAR levels with labels
export const BAR_LEVEL_OPTIONS = Array.from({ length: 20 }, (_, i) => {
  const level = i - 9; // -9 to 10
  return {
    value: level,
    label: `BAR ${level > 0 ? level : level === 0 ? "0" : level}`,
    season: barToSeason(level),
  };
});

export const OPERATIONAL_BAR_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

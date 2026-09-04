import type {
  BarPeriod,
  HistoricalDataPoint,
  Season,
  PricingResult,
  RoomId,
  EventItem,
  CompetitorSample,
  PricingRationale,
  BarRateEntry,
} from "@/types";
import { BAR_RATES_TABLE } from "@/data/bar-table";
import { HISTORICAL_DATA } from "@/data/historical-calendar";
import { ROOMS } from "@/data/rooms";
import { formatCurrency, addDays, daysBetween } from "@/lib/utils";
import { sanitizeEventItem } from "@/lib/claude-events";

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
  barPeriods: BarPeriod[] = [],
  events: EventItem[] = []
): { price: number; barLevel: number; barSource: "event" | "manual" | "firestore" | "historical" | "default"; season: Season; activeEvents?: EventItem[] } {
  let barLevel: number;
  let barSource: "event" | "manual" | "firestore" | "historical" | "default";

  // 1. Check active Events (sanitized with anti-distortion guardrails & lead-in D-1)
  const appliedEvents = events
    .map((e) => sanitizeEventItem(e))
    .filter((e) => {
      if (e.enabled === false) return false;
      const start = e.effectiveStartDate || (e.startDate ? addDays(e.startDate, -(e.leadInDays ?? 1)) : e.startDate);
      return dateISO >= start && dateISO <= e.endDate;
    });

  const topEvent = appliedEvents.length > 0
    ? appliedEvents.reduce((min, e) => (e.recommendedBar < min.recommendedBar ? e : min), appliedEvents[0])
    : null;

  // 2. Check Firestore bar_periods (passed in)
  const matchingPeriod = barPeriods.find((p) => {
    let effectiveEnd = p.endDate;
    if ((p.id?.startsWith("period-event-") || p.notes?.startsWith("Evento:")) && p.barLevel <= 3) {
      const days = daysBetween(p.startDate, p.endDate);
      if (days > 4) {
        effectiveEnd = addDays(p.startDate, 4);
      }
    }
    return dateISO >= p.startDate && dateISO <= effectiveEnd;
  });

  const isUserManual = matchingPeriod?.isManual === true;

  if (topEvent) {
    if (matchingPeriod) {
      // If manual period exists, use the tighter BAR (lower numeric value = higher rate)
      barLevel = Math.min(matchingPeriod.barLevel, topEvent.recommendedBar);
      barSource = barLevel === topEvent.recommendedBar ? "event" : isUserManual ? "manual" : "historical";
    } else {
      barLevel = topEvent.recommendedBar;
      barSource = "event";
    }
  } else if (matchingPeriod) {
    barLevel = matchingPeriod.barLevel;
    barSource = isUserManual ? "manual" : "historical";
  } else {
    // 3. Infer from historical data
    const historicalBar = getHistoricalBarForDate(dateISO);
    if (historicalBar !== null) {
      barLevel = historicalBar;
      barSource = "historical";
    } else {
      // 4. Default: BAR 5
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

  return { price, barLevel, barSource, season: barToSeason(barLevel), activeEvents: appliedEvents };
}

export function getPricingForAllRooms(
  dateISO: string,
  options: PricingOptions = {},
  barPeriods: BarPeriod[] = [],
  events: EventItem[] = []
): PricingResult[] {
  return ROOMS.map((room) => {
    const { price, barLevel, barSource, season } = getPriceForDate(
      room.id,
      dateISO,
      options,
      barPeriods,
      events
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

/**
 * Returns a complete, transparent, step-by-step pricing rationale for a specific room and date.
 */
export function getDetailedPricingRationale(
  dateISO: string,
  roomId: RoomId = "standard",
  options: PricingOptions = {},
  barPeriods: BarPeriod[] = [],
  events: EventItem[] = [],
  competitorSamples: CompetitorSample[] = []
): PricingRationale {
  const { pax = 1, breakfast = false } = options;
  const room = ROOMS.find((r) => r.id === roomId) ?? ROOMS[0];

  // 1. Base Historical
  const baseHistoricalBar = getHistoricalBarForDate(dateISO);
  const defaultBar = baseHistoricalBar ?? 5;

  // 2. Manual Override Period
  const manualOverridePeriod = barPeriods.find((p) => {
    let effectiveEnd = p.endDate;
    if ((p.id?.startsWith("period-event-") || p.notes?.startsWith("Evento:")) && p.barLevel <= 3) {
      const days = daysBetween(p.startDate, p.endDate);
      if (days > 4) {
        effectiveEnd = addDays(p.startDate, 4);
      }
    }
    return dateISO >= p.startDate && dateISO <= effectiveEnd;
  });

  // 3. Events affecting this date (respects enabled state & pre-event lead-in D-1)
  const appliedEvents = events
    .map((e) => sanitizeEventItem(e))
    .filter((e) => {
      if (e.enabled === false) return false;
      const start = e.effectiveStartDate || (e.startDate ? addDays(e.startDate, -(e.leadInDays ?? 1)) : e.startDate);
      return dateISO >= start && dateISO <= e.endDate;
    });

  const topEvent = appliedEvents.length > 0
    ? appliedEvents.reduce((min, e) => (e.recommendedBar < min.recommendedBar ? e : min), appliedEvents[0])
    : null;

  // 4. Final BAR Level determination
  let finalBarLevel = defaultBar;
  if (topEvent) {
    if (manualOverridePeriod) {
      finalBarLevel = Math.min(manualOverridePeriod.barLevel, topEvent.recommendedBar);
    } else {
      finalBarLevel = topEvent.recommendedBar;
    }
  } else if (manualOverridePeriod) {
    finalBarLevel = manualOverridePeriod.barLevel;
  }

  const finalSeason = barToSeason(finalBarLevel);

  // 5. Competitor benchmark for this date or closest sample
  let competitorBenchmark: PricingRationale["competitorBenchmark"] = undefined;
  if (competitorSamples.length > 0) {
    const exactSample = competitorSamples.find((s) => s.date === dateISO || s.checkin === dateISO);
    const sampleToUse = exactSample ?? competitorSamples[0];
    if (sampleToUse && sampleToUse.competitors.length > 0) {
      const valid1 = sampleToUse.competitors.filter((c) => c.finalPrice1Pax > 0);
      const valid2 = sampleToUse.competitors.filter((c) => c.finalPrice2Pax > 0);
      const avg1 = valid1.length > 0 ? valid1.reduce((s, c) => s + c.finalPrice1Pax, 0) / valid1.length : 0;
      const avg2 = valid2.length > 0 ? valid2.reduce((s, c) => s + c.finalPrice2Pax, 0) / valid2.length : 0;
      
      const stdRates = getRatesForRoom("standard", finalBarLevel);
      const stdPrice1 = stdRates?.without_breakfast_1pax ?? 0;
      
      competitorBenchmark = {
        avg1Pax: Math.round(avg1),
        avg2Pax: Math.round(avg2),
        sampleDate: sampleToUse.date ?? sampleToUse.checkin,
        sampleCount: sampleToUse.competitors.length,
        allureDiff1Pax: Math.round(avg1 - stdPrice1),
      };
    }
  }

  // 6. Prices for selected room and all rooms
  const rates = getRatesForRoom(roomId, finalBarLevel);
  let finalPrice = 0;
  if (rates) {
    if (breakfast) {
      finalPrice = pax === 2 ? rates.with_breakfast_2pax : rates.with_breakfast_1pax;
    } else {
      finalPrice = pax === 2 ? rates.without_breakfast_2pax : rates.without_breakfast_1pax;
    }
  }

  const allRoomPrices = {} as Record<RoomId, BarRateEntry>;
  for (const r of ROOMS) {
    const rRates = getRatesForRoom(r.id, finalBarLevel);
    allRoomPrices[r.id] = rRates ?? {
      without_breakfast_1pax: 0,
      without_breakfast_2pax: 0,
      with_breakfast_1pax: 0,
      with_breakfast_2pax: 0,
    };
  }

  // 7. Step-by-step rationale explanation
  const steps: PricingRationale["steps"] = [
    {
      step: 1,
      title: "Sazonalidade Histórica de Referência",
      description: baseHistoricalBar !== null
        ? `A média histórica (2023-2024) para esta data/mês indica tarifa ${barToSeason(baseHistoricalBar).toUpperCase()} (BAR ${baseHistoricalBar}).`
        : "Sem registro exato no calendário histórico. Padrão inicial definido como BAR 5 (Temporada Normal).",
      resultValue: `BAR ${defaultBar}`,
    },
    {
      step: 2,
      title: manualOverridePeriod?.isManual ? "Ajuste Manual do Usuário" : "Histórico Sazonal & Calibração",
      description: manualOverridePeriod?.isManual
        ? `Ajuste manual criado pelo usuário (${manualOverridePeriod.startDate} a ${manualOverridePeriod.endDate}): "${manualOverridePeriod.notes || "Ajuste manual"}". Sobrescreve a sazonalidade.`
        : manualOverridePeriod
        ? `Vigência sazonal de referência (${manualOverridePeriod.startDate} a ${manualOverridePeriod.endDate}): "${manualOverridePeriod.notes || "Sazonalidade"}".`
        : "Nenhum período de exceção cadastrado para esta data. Mantém base histórica.",
      resultValue: manualOverridePeriod?.isManual
        ? `BAR ${manualOverridePeriod.barLevel} (Manual)`
        : manualOverridePeriod
        ? `BAR ${manualOverridePeriod.barLevel} (Sazonal)`
        : "Base histórica",
    },
    {
      step: 3,
      title: "Impacto de Eventos Locais (Raio Moema / SP)",
      description: appliedEvents.length > 0
        ? `${appliedEvents.length} evento(s) no período: ${appliedEvents.map((e) => `${e.title} (${e.location}) [Impacto ${e.impact.toUpperCase()}]`).join(", ")}.`
        : "Nenhum grande evento mapeado para esta data no raio de influência de Moema.",
      resultValue: appliedEvents.length > 0 ? `${appliedEvents.length} evento(s)` : "Sem eventos",
    },
    {
      step: 4,
      title: "Benchmark de Mercado (Concorrentes Booking.com)",
      description: competitorBenchmark
        ? `Média de ${competitorBenchmark.sampleCount} hotéis concorrentes em Moema: ${formatCurrency(competitorBenchmark.avg1Pax)} (1 Pax) e ${formatCurrency(competitorBenchmark.avg2Pax)} (2 Pax). Allure Standard está ${competitorBenchmark.allureDiff1Pax >= 0 ? `${formatCurrency(competitorBenchmark.allureDiff1Pax)} abaixo da média de mercado` : `${formatCurrency(Math.abs(competitorBenchmark.allureDiff1Pax))} acima da média`}.`
        : "Sem amostra de concorrentes disponível para confronto direto.",
      resultValue: competitorBenchmark ? `${formatCurrency(competitorBenchmark.avg1Pax)} médio` : "N/D",
    },
    {
      step: 5,
      title: "Matriz BAR por Tipologia e Regime",
      description: `Aplicação do BAR ${finalBarLevel} na tabela matricial para ${room.name} (${pax} Pax, ${breakfast ? "Com Café" : "Sem Café"}).`,
      resultValue: formatCurrency(finalPrice),
    },
  ];

  return {
    date: dateISO,
    roomId,
    roomName: room.name,
    pax,
    breakfast,
    baseHistoricalBar,
    manualOverridePeriod,
    appliedEvents,
    competitorBenchmark,
    finalBarLevel,
    finalSeason,
    finalPrice,
    allRoomPrices,
    steps,
  };
}


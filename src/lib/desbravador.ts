import type {
  BarPeriod,
  RoomId,
  DesbravadorPriceEntry,
  DesbravadorSyncPayload,
  DesbravadorSyncLog,
  IntegrationSettings,
  DesbravadorComparisonItem,
  Season,
} from "@/types";
import { getRatesForRoom, getPriceForDate, barToSeason } from "@/lib/pricing-engine";
import { ROOMS } from "@/data/rooms";
import { addDays, todayISO } from "@/lib/utils";

// Mapping of room IDs to Desbravador RentalUnitType IDs
export const DESBRAVADOR_ROOM_MAP: Record<RoomId, number> = {
  standard: 1042,
  select: 1043,
  "select-garden": 1044,
  "standard-garden": 1045,
  suite: 2745,
  "select-plus": 2746,
};

// Rate Company Plans
export const DESBRAVADOR_PLANS = {
  WITH_BREAKFAST: { id: 15270, name: "Com Café da Manhã" },
  WITHOUT_BREAKFAST: { id: 15271, name: "Sem Café da Manhã" },
};

export const DESBRAVADOR_PAX_CLASSIFICATION = {
  ADULT: 386,
  CHILD_FREE: 387,
};

export const DESBRAVADOR_CONFIG = {
  COMPANY_ID: 6181,
  CHANNEL_ID: 4484,
  PROTOCOL: "COURCHEVEL",
  PROD_URL: "https://channel.desbravador.com.br/cm-integration-rate-bebook/rates/sync",
  HML_URL: "https://hml.channel.hmldesbravador.com/cm-integration-rate-bebook/rates/sync",
  DEFAULT_USER: process.env.DESBRAVADOR_USER || "nyo",
  DEFAULT_PASS: process.env.DESBRAVADOR_PASS || "Cb-N93R0+r1p",
};

/**
 * Baseline/current static registered rates in Desbravador PMS before dynamic Yield.
 * Used for comparative analysis (Desbravador Atual X Allure Sugerido).
 */
export const DESBRAVADOR_CURRENT_REGISTERED_RATES: Record<
  RoomId,
  {
    without_breakfast_1pax: number;
    without_breakfast_2pax: number;
    with_breakfast_1pax: number;
    with_breakfast_2pax: number;
  }
> = {
  standard: {
    without_breakfast_1pax: 380.0,
    without_breakfast_2pax: 420.0,
    with_breakfast_1pax: 430.0,
    with_breakfast_2pax: 520.0,
  },
  select: {
    without_breakfast_1pax: 440.0,
    without_breakfast_2pax: 480.0,
    with_breakfast_1pax: 490.0,
    with_breakfast_2pax: 580.0,
  },
  "select-garden": {
    without_breakfast_1pax: 490.0,
    without_breakfast_2pax: 530.0,
    with_breakfast_1pax: 540.0,
    with_breakfast_2pax: 630.0,
  },
  "standard-garden": {
    without_breakfast_1pax: 410.0,
    without_breakfast_2pax: 450.0,
    with_breakfast_1pax: 460.0,
    with_breakfast_2pax: 550.0,
  },
  suite: {
    without_breakfast_1pax: 680.0,
    without_breakfast_2pax: 730.0,
    with_breakfast_1pax: 730.0,
    with_breakfast_2pax: 830.0,
  },
  "select-plus": {
    without_breakfast_1pax: 520.0,
    without_breakfast_2pax: 560.0,
    with_breakfast_1pax: 570.0,
    with_breakfast_2pax: 660.0,
  },
};

/**
 * Builds the payload for sending rate updates to Desbravador for a specific date range and plan.
 */
export function buildDesbravadorPayload({
  startDate,
  endDate,
  planId,
  barPeriods = [],
  offsetCents = 0,
  specificRoomId,
  customUser,
  customPass,
  companyId,
}: {
  startDate: string;
  endDate: string;
  planId: number; // 15270 (com café) or 15271 (sem café)
  barPeriods?: BarPeriod[];
  offsetCents?: number; // e.g. 1 (+0.01) or -1 (-0.01)
  specificRoomId?: RoomId;
  customUser?: string;
  customPass?: string;
  companyId?: number;
}): DesbravadorSyncPayload {
  const isBreakfast = planId === DESBRAVADOR_PLANS.WITH_BREAKFAST.id;
  const prices: DesbravadorPriceEntry[] = [];

  const roomsToProcess = specificRoomId
    ? ROOMS.filter((r) => r.id === specificRoomId)
    : ROOMS;

  for (const room of roomsToProcess) {
    const rentalUnitTypeId = DESBRAVADOR_ROOM_MAP[room.id as RoomId];
    if (!rentalUnitTypeId) continue;

    const { price: price1Pax } = getPriceForDate(
      room.id,
      startDate,
      { pax: 1, breakfast: isBreakfast },
      barPeriods
    );

    const { price: price2Pax } = getPriceForDate(
      room.id,
      startDate,
      { pax: 2, breakfast: isBreakfast },
      barPeriods
    );

    const finalVal1 = Math.max(1, price1Pax + offsetCents / 100);
    const finalVal2 = Math.max(1, price2Pax + offsetCents / 100);

    // 1 PAX Adult
    prices.push({
      rentalUnitType: { id: rentalUnitTypeId },
      paxAmount: 1,
      paxClassification: { id: DESBRAVADOR_PAX_CLASSIFICATION.ADULT },
      value: finalVal1.toFixed(2),
    });

    // 2 PAX Adult
    prices.push({
      rentalUnitType: { id: rentalUnitTypeId },
      paxAmount: 2,
      paxClassification: { id: DESBRAVADOR_PAX_CLASSIFICATION.ADULT },
      value: finalVal2.toFixed(2),
    });
  }

  return {
    credentials: {
      user: customUser || DESBRAVADOR_CONFIG.DEFAULT_USER,
      pass: customPass || DESBRAVADOR_CONFIG.DEFAULT_PASS,
    },
    startDate,
    endDate,
    sunday: true,
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: true,
    saturday: true,
    rateCompany: {
      company: { id: companyId || DESBRAVADOR_CONFIG.COMPANY_ID },
      id: planId,
    },
    prices,
  };
}

/**
 * Sends a single rate synchronization payload to the Desbravador CM API.
 */
export async function sendRatesToDesbravador(
  payload: DesbravadorSyncPayload,
  useProduction = true
): Promise<{ success: boolean; data: any; statusCode: number; durationMs: number }> {
  const url = useProduction ? DESBRAVADOR_CONFIG.PROD_URL : DESBRAVADOR_CONFIG.HML_URL;
  const start = Date.now();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const durationMs = Date.now() - start;
    let data: any = {};
    try {
      data = await response.json();
    } catch {
      data = { rawText: await response.text() };
    }

    const isSuccess = response.ok && data?.forError === false;

    return {
      success: isSuccess,
      data,
      statusCode: response.status,
      durationMs,
    };
  } catch (err: any) {
    const durationMs = Date.now() - start;
    return {
      success: false,
      data: { error: err.message || "Network error" },
      statusCode: 500,
      durationMs,
    };
  }
}

/**
 * Helper to pause execution (rate limit safety)
 */
export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Syncs an entire date horizon for both plans (with and without breakfast)
 * respecting rate limits (1100ms delay between API calls).
 */
export async function syncFullHorizonDesbravador({
  horizonDays = 30,
  barPeriods = [],
  triggeredBy = "manual",
  useProduction = true,
}: {
  horizonDays?: number;
  barPeriods?: BarPeriod[];
  triggeredBy?: string;
  useProduction?: boolean;
}): Promise<DesbravadorSyncLog[]> {
  const logs: DesbravadorSyncLog[] = [];
  const start = todayISO();
  const end = addDays(start, horizonDays);

  const plans = [
    { ...DESBRAVADOR_PLANS.WITHOUT_BREAKFAST },
    { ...DESBRAVADOR_PLANS.WITH_BREAKFAST },
  ];

  for (const plan of plans) {
    const payload = buildDesbravadorPayload({
      startDate: start,
      endDate: end,
      planId: plan.id,
      barPeriods,
    });

    const result = await sendRatesToDesbravador(payload, useProduction);

    const log: DesbravadorSyncLog = {
      id: `sync-log-${Date.now()}-${plan.id}`,
      timestamp: new Date().toISOString(),
      startDate: start,
      endDate: end,
      rateCompanyId: plan.id,
      rateCompanyName: plan.name,
      ratesCount: payload.prices.length,
      status: result.success ? "success" : "error",
      responseCode: result.statusCode,
      message: result.success
        ? `Sincronização de ${payload.prices.length} tarifas enviada com sucesso para ${plan.name}.`
        : `Erro na API Desbravador: ${result.data?.message || JSON.stringify(result.data)}`,
      durationMs: result.durationMs,
      triggeredBy,
    };

    logs.push(log);

    // Rate limit safety: wait 1100ms between calls
    await delay(1100);
  }

  return logs;
}

/**
 * Compares current registered rates in Desbravador vs Allure Pricing Engine suggested rates.
 */
export function getDesbravadorComparison({
  dateISO = todayISO(),
  pax = 1,
  breakfast = false,
  barPeriods = [],
}: {
  dateISO?: string;
  pax?: 1 | 2;
  breakfast?: boolean;
  barPeriods?: BarPeriod[];
}): {
  items: DesbravadorComparisonItem[];
  overallAvgDesbravador: number;
  overallAvgAllure: number;
  overallDiffAmount: number;
  overallDiffPercent: number;
  activeBarLevel: number;
  season: Season;
} {
  const items: DesbravadorComparisonItem[] = [];
  let sumDesbravador = 0;
  let sumAllure = 0;
  let activeBarLevel = 5;
  let season: Season = "normal";

  for (const room of ROOMS) {
    const rentalUnitTypeId = DESBRAVADOR_ROOM_MAP[room.id as RoomId] || 0;
    const registered = DESBRAVADOR_CURRENT_REGISTERED_RATES[room.id as RoomId];

    let currentRegisteredPrice = 0;
    if (registered) {
      if (breakfast) {
        currentRegisteredPrice = pax === 2 ? registered.with_breakfast_2pax : registered.with_breakfast_1pax;
      } else {
        currentRegisteredPrice = pax === 2 ? registered.without_breakfast_2pax : registered.without_breakfast_1pax;
      }
    }

    const pricing = getPriceForDate(room.id, dateISO, { pax, breakfast }, barPeriods);
    activeBarLevel = pricing.barLevel;
    season = pricing.season;

    const suggestedPrice = pricing.price;
    const diffAmount = suggestedPrice - currentRegisteredPrice;
    const diffPercent = currentRegisteredPrice > 0 ? (diffAmount / currentRegisteredPrice) * 100 : 0;

    let status: DesbravadorComparisonItem["status"] = "aligned";
    if (diffAmount > 10) {
      status = "uplift_opportunity";
    } else if (diffAmount < -10) {
      status = "reduction_recommended";
    }

    items.push({
      roomId: room.id,
      roomName: room.name,
      rentalUnitTypeId,
      sqm: room.sqm,
      desbravadorCurrentPrice: currentRegisteredPrice,
      allureSuggestedPrice: suggestedPrice,
      diffAmount,
      diffPercent,
      activeBarLevel,
      season,
      status,
    });

    sumDesbravador += currentRegisteredPrice;
    sumAllure += suggestedPrice;
  }

  const count = items.length || 1;
  const overallAvgDesbravador = Math.round(sumDesbravador / count);
  const overallAvgAllure = Math.round(sumAllure / count);
  const overallDiffAmount = overallAvgAllure - overallAvgDesbravador;
  const overallDiffPercent =
    overallAvgDesbravador > 0
      ? Number(((overallDiffAmount / overallAvgDesbravador) * 100).toFixed(1))
      : 0;

  return {
    items,
    overallAvgDesbravador,
    overallAvgAllure,
    overallDiffAmount,
    overallDiffPercent,
    activeBarLevel,
    season,
  };
}

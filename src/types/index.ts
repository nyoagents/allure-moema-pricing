export type RoomId =
  | "standard"
  | "select"
  | "standard-garden"
  | "select-garden"
  | "select-plus"
  | "suite";

export type StayType = "short" | "long" | "both";
export type Season = "alta" | "media" | "baixa" | "normal";

export interface Room {
  id: RoomId;
  name: string;
  sqm: number;
  maxGuests: number;
  stayType: StayType;
  description?: string;
}

export interface BarRateEntry {
  without_breakfast_1pax: number;
  without_breakfast_2pax: number;
  with_breakfast_1pax: number;
  with_breakfast_2pax: number;
}

export type BarLevel = number; // -9 to 17, operational range 1-10

export interface RoomBarRates {
  roomId: RoomId;
  rates: Record<string, BarRateEntry>; // key: bar level string e.g. "5"
}

export interface BarPeriod {
  id: string;
  startDate: string; // ISO date YYYY-MM-DD
  endDate: string;
  barLevel: BarLevel;
  season: Season;
  notes?: string;
  isManual?: boolean; // true only if explicitly edited/created by user as an override
  createdAt?: string;
  updatedAt?: string;
}

export interface HistoricalDataPoint {
  date: string; // YYYY-MM-DD
  month: number;
  year: number;
  dayOfWeek: string;
  barLevel: BarLevel;
  bibicPrice?: number;
  allureStandardPrice?: number;
}

export interface CompetitorSample {
  id: string;
  date: string; // YYYY-MM-DD
  checkin?: string;
  checkout?: string;
  competitors: CompetitorEntry[];
  notes?: string;
  createdAt?: string;
  scrapedAt?: string; // ISO timestamp — present when collected via scraper
}

export interface CompetitorEntry {
  name: string;
  bookingUrl?: string;
  sqm?: number;
  price1Pax: number;
  price2Pax: number;
  fee: number;
  finalPrice1Pax: number;
  finalPrice2Pax: number;
  inclusions?: string[];   // e.g. ["Café da manhã", "Garrafa de vinho", "Internet"]
  roomType?: string;       // cheapest room type found on Booking
  cancellation?: string;   // e.g. "Cancelamento grátis até 14/07"
}

export interface CompetitorUrl {
  id: string;         // hotel slug
  name: string;       // human-readable name
  bookingUrl: string; // canonical URL (no label/sid query params)
  active: boolean;
}

export interface User {
  uid: string;
  email: string;
  role: "admin" | "viewer";
  name?: string;
}

export interface PricingResult {
  roomId: RoomId;
  roomName: string;
  barLevel: BarLevel;
  barSource: "event" | "manual" | "firestore" | "historical" | "default";
  season: Season;
  prices: BarRateEntry;
}

// ── Events & Intelligence Types ──────────────────────────────────────────────
export type EventImpact = "critico" | "alto" | "medio" | "baixo";

export interface EventItem {
  id: string;
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  location: string;  // e.g. "São Paulo Expo", "Parque Ibirapuera", "Autódromo de Interlagos"
  venue?: string;
  distanceKm?: number; // Distance in km to Allure Moema
  estimatedAttendance?: string; // e.g. "50.000 pessoas"
  impact: EventImpact;
  recommendedBar: BarLevel;
  reason: string;
  category: "feira_negocios" | "congresso" | "show_festival" | "esporte" | "feriado" | "outro";
  imageUrl?: string; // High-res photo of event / venue / category
  source?: string;
  enabled?: boolean; // Default true: automatically active in calendar
  leadInDays?: number; // Default 1: impact starts day before arrival (D-1)
  effectiveStartDate?: string; // e.g. startDate - 1 day
  createdAt?: string;
}

// ── Simulation & Calculation History Types ───────────────────────────────────
export interface SimulationDayBreakdown {
  date: string; // YYYY-MM-DD
  dayOfWeek?: string;
  barLevel: BarLevel;
  season: Season;
  barSource: "event" | "manual" | "firestore" | "historical" | "default";
  price: number;
  events?: string[];
  competitorAvg?: number;
  rationale?: string;
}

export interface SimulationRecord {
  id: string;
  createdAt: string; // ISO
  userEmail: string;
  roomId: RoomId;
  roomName: string;
  checkin: string; // YYYY-MM-DD
  checkout: string; // YYYY-MM-DD
  nights: number;
  pax: 1 | 2;
  breakfast: boolean;
  total: number;
  averagePerNight: number;
  breakdown: SimulationDayBreakdown[];
  notes?: string;
}

// ── Detailed Pricing Rationale ───────────────────────────────────────────────
export interface PricingRationale {
  date: string;
  roomId: RoomId;
  roomName: string;
  pax: 1 | 2;
  breakfast: boolean;
  baseHistoricalBar: BarLevel | null;
  manualOverridePeriod?: BarPeriod;
  appliedEvents: EventItem[];
  competitorBenchmark?: {
    avg1Pax: number;
    avg2Pax: number;
    sampleDate?: string;
    sampleCount: number;
    allureDiff1Pax: number;
  };
  finalBarLevel: BarLevel;
  finalSeason: Season;
  finalPrice: number;
  allRoomPrices: Record<RoomId, BarRateEntry>;
  steps: {
    step: number;
    title: string;
    description: string;
    resultValue: string;
  }[];
}

// ── Desbravador Channel Manager Types ─────────────────────────────────────────
export interface DesbravadorPriceEntry {
  rentalUnitType: { id: number }; // 1042 Standard, 1043 Select, etc.
  paxAmount: number; // 1 or 2
  paxClassification: { id: number }; // 386 Adulto
  value: string; // "547.00"
}

export interface DesbravadorSyncPayload {
  credentials: {
    user: string;
    pass: string;
  };
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  sunday: boolean;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  rateCompany: {
    company: { id: number }; // 6181
    id: number;              // 15270 (com café) or 15271 (sem café)
  };
  prices: DesbravadorPriceEntry[];
}

export interface DesbravadorSyncLog {
  id: string;
  timestamp: string;
  startDate: string;
  endDate: string;
  rateCompanyId: number;
  rateCompanyName: string;
  ratesCount: number;
  status: "success" | "error";
  responseCode?: number;
  message?: string;
  durationMs: number;
  triggeredBy: string; // user email or "cron"
  isTestOffset?: boolean;
  offsetAmount?: number;
}

export interface DesbravadorComparisonItem {
  roomId: RoomId;
  roomName: string;
  rentalUnitTypeId: number;
  sqm: number;
  desbravadorCurrentPrice: number;
  allureSuggestedPrice: number;
  diffAmount: number;
  diffPercent: number;
  activeBarLevel: number;
  season: Season;
  status: "uplift_opportunity" | "aligned" | "reduction_recommended";
}

export interface IntegrationSettings {
  desbravadorAutoSync: boolean;
  desbravadorCompanyId: number;
  desbravadorChannelId: number;
  syncHorizonDays: number; // e.g. 30, 60, 90
  lastSyncAt?: string;
  lastSyncStatus?: "success" | "error";
  lastSyncMessage?: string;
}

/** Async scrape job queued by the UI and executed on the VPS worker */
export type ScrapeJobStatus = "pending" | "running" | "done" | "error";

export interface ScrapeJobParams {
  mode: "period" | "single";
  checkin?: string;
  checkout?: string;
  periodStart?: string;
  periodEnd?: string;
  step?: number;
  weekendsOnly?: boolean;
  hotelIds: string[]; // empty = all active
  adults: 1 | 2 | "both";
}

export interface ScrapeJob {
  id: string;
  status: ScrapeJobStatus;
  params: ScrapeJobParams;
  estimatedDates: number;
  estimatedHotels: number;
  estimatedRequests: number;
  estimatedMinutesMin: number;
  estimatedMinutesMax: number;
  progressPercent: number;
  logs: string[];
  error?: string;
  triggeredBy?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
}



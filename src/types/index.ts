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
  barSource: "firestore" | "historical" | "default";
  season: Season;
  prices: BarRateEntry;
}

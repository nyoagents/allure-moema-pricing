import { COMPETITOR_URLS } from "@/data/competitors";
import type { ScrapeJobParams } from "@/types";

/** Rough Booking scrape cost: ~12–20s per hotel×date when adults=both (2 passes). */
const SEC_PER_REQUEST_MIN = 10;
const SEC_PER_REQUEST_MAX = 22;

export function countScrapeDates(params: Pick<ScrapeJobParams, "mode" | "periodStart" | "periodEnd" | "step" | "weekendsOnly" | "checkin">): number {
  if (params.mode === "single") return 1;
  if (!params.periodStart || !params.periodEnd) return 0;
  const step = Math.max(1, params.step ?? 1);
  const start = new Date(params.periodStart + "T12:00:00Z");
  const end = new Date(params.periodEnd + "T12:00:00Z");
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getUTCDay();
    if (!params.weekendsOnly || dow === 0 || dow === 5 || dow === 6) count++;
    cur.setUTCDate(cur.getUTCDate() + step);
  }
  return count;
}

export function resolveHotelCount(hotelIds: string[]): number {
  if (hotelIds.length > 0) return hotelIds.length;
  return COMPETITOR_URLS.filter((h) => h.active).length;
}

export function estimateScrapeWorkload(params: ScrapeJobParams) {
  const estimatedDates = countScrapeDates(params);
  const estimatedHotels = resolveHotelCount(params.hotelIds);
  const adultPasses = params.adults === "both" ? 2 : 1;
  const estimatedRequests = Math.max(1, estimatedDates * estimatedHotels * adultPasses);
  const estimatedMinutesMin = Math.max(1, Math.ceil((estimatedRequests * SEC_PER_REQUEST_MIN) / 60));
  const estimatedMinutesMax = Math.max(estimatedMinutesMin, Math.ceil((estimatedRequests * SEC_PER_REQUEST_MAX) / 60));
  return {
    estimatedDates,
    estimatedHotels,
    estimatedRequests,
    estimatedMinutesMin,
    estimatedMinutesMax,
  };
}

/**
 * Scraper de preços de concorrentes via Booking.com (Playwright/Chromium).
 *
 * Modos de uso:
 *
 *   # Uma diária específica:
 *   npx tsx scripts/scrape-competitors.ts --checkin 2026-07-15 --checkout 2026-07-16
 *
 *   # Período completo (gera uma amostra por data):
 *   npx tsx scripts/scrape-competitors.ts --period-start 2026-07-01 --period-end 2026-07-31
 *
 *   # Período com passo personalizado:
 *   npx tsx scripts/scrape-competitors.ts --period-start 2026-07-01 --period-end 2026-07-31 --step 3
 *
 *   # Apenas fins de semana do período:
 *   npx tsx scripts/scrape-competitors.ts --period-start 2026-07-01 --period-end 2026-07-31 --weekends-only
 *
 *   # Dry-run (sem salvar):
 *   npx tsx scripts/scrape-competitors.ts --period-start 2026-07-01 --period-end 2026-07-31 --dry-run
 *
 *   # Hotel específico:
 *   npx tsx scripts/scrape-competitors.ts --period-start 2026-07-01 --period-end 2026-07-31 --hotel charlie-for-you-moema
 *
 * Flags:
 *   --checkin        YYYY-MM-DD  (modo diária única)
 *   --checkout       YYYY-MM-DD  (modo diária única)
 *   --period-start   YYYY-MM-DD  (modo período)
 *   --period-end     YYYY-MM-DD  (modo período)
 *   --step           N           Intervalo em dias entre datas (padrão: 1)
 *   --weekends-only              Só sex/sáb/dom
 *   --dry-run                    Imprime sem salvar
 *   --hotel          <id>        Scrapa apenas um hotel
 *   --adults         1|2         Adultos (padrão: 2)
 */

import { chromium } from "playwright";
import * as admin from "firebase-admin";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { COMPETITOR_URLS } from "../src/data/competitors";
import type { CompetitorEntry, CompetitorSample } from "../src/types";

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag: string) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : undefined; };

const singleCheckin = getArg("--checkin");
const singleCheckout = getArg("--checkout");
const periodStart = getArg("--period-start");
const periodEnd = getArg("--period-end");
const stepDays = parseInt(getArg("--step") ?? "1", 10);
const weekendsOnly = args.includes("--weekends-only");
const dryRun = args.includes("--dry-run");
const hotelFilter = getArg("--hotel");
const adultsArg = getArg("--adults") ?? "2";
const adultsBoth = adultsArg === "both";
const adults = adultsBoth ? 2 : parseInt(adultsArg, 10);

// ── Build date pairs ──────────────────────────────────────────────────────────
interface DatePair { checkin: string; checkout: string }

function addDays(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isWeekend(dateISO: string): boolean {
  const dow = new Date(dateISO + "T12:00:00Z").getUTCDay(); // 0=Sun,5=Fri,6=Sat
  return dow === 0 || dow === 5 || dow === 6;
}

function buildDatePairs(): DatePair[] {
  if (singleCheckin && singleCheckout) {
    return [{ checkin: singleCheckin, checkout: singleCheckout }];
  }
  if (periodStart && periodEnd) {
    const pairs: DatePair[] = [];
    let current = periodStart;
    while (current <= periodEnd) {
      if (!weekendsOnly || isWeekend(current)) {
        pairs.push({ checkin: current, checkout: addDays(current, 1) });
      }
      current = addDays(current, stepDays);
    }
    return pairs;
  }
  return [];
}

const datePairs = buildDatePairs();

if (datePairs.length === 0) {
  console.error("❌ Especifique --checkin/--checkout OU --period-start/--period-end");
  console.error("   Exemplo: --period-start 2026-07-01 --period-end 2026-07-31");
  process.exit(1);
}

// ── Firebase ──────────────────────────────────────────────────────────────────
let db: admin.firestore.Firestore | null = null;
if (!dryRun) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    console.error("❌ Variáveis Firebase não encontradas. Use --dry-run para testar.");
    process.exit(1);
  }
  admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }) });
  db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });
}

// ── Hotels to scrape ──────────────────────────────────────────────────────────
const hotels = hotelFilter
  ? COMPETITOR_URLS.filter((h) => h.id === hotelFilter)
  : COMPETITOR_URLS.filter((h) => h.active);

if (hotels.length === 0) {
  console.error(`❌ Hotel não encontrado: ${hotelFilter}`);
  process.exit(1);
}

// ── URL builder ───────────────────────────────────────────────────────────────
function buildUrl(baseUrl: string, checkin: string, checkout: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("checkin", checkin);
  url.searchParams.set("checkout", checkout);
  url.searchParams.set("group_adults", String(adults));
  url.searchParams.set("no_rooms", "1");
  url.searchParams.set("group_children", "0");
  return url.toString();
}

// ── Scrape single hotel ───────────────────────────────────────────────────────
async function scrapeHotel(
  page: import("playwright").Page,
  hotel: (typeof COMPETITOR_URLS)[number],
  checkin: string,
  checkout: string
): Promise<CompetitorEntry | null> {
  try {
    await page.goto(buildUrl(hotel.bookingUrl, checkin, checkout), {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    await page
      .waitForSelector(".hprt-table, [data-testid='availability-and-prices-table'], .roomstable", { timeout: 15_000 })
      .catch(() => null);

    await page.waitForTimeout(2000);

    const scraped = await page.evaluate(() => {
      const rooms: { roomType: string; price2Pax?: number; inclusions: string[]; cancellation?: string }[] = [];

      // Strategy 1: classic .hprt-table — use data-hotel-rounded-price as primary price source
      document.querySelectorAll(".hprt-table tr.js-rt-block-row, .hprt-table tr[data-hotel-rounded-price]").forEach((row) => {
        const roomType = (
          row.querySelector(".hprt-roomtype-icon-link, .hprt-roomtype-link, .hprt-roomtype")
        )?.textContent?.trim() ?? "";
        if (!roomType) return;

        // Prefer the data attribute; fall back to price text
        const attrPrice = parseInt((row as HTMLElement).dataset.hotelRoundedPrice ?? "", 10);
        let price = attrPrice > 0 ? attrPrice : 0;
        if (!price) {
          const priceEl = row.querySelector(".prco-valign-middle-helper, .bui-price-display__value, [data-et-click*='price']");
          const rawPrice = priceEl?.textContent?.trim() ?? "";
          price = rawPrice ? parseFloat(rawPrice.replace(/[^\d,.]/g, "").replace(",", ".")) || 0 : 0;
        }

        const inclusions: string[] = [];
        row.querySelectorAll(".hprt-facilities-facility [data-name-en]").forEach((el) => {
          const t = (el as HTMLElement).dataset.nameEn?.trim();
          if (t) inclusions.push(t);
        });
        // Also grab breakfast / extra facilities text
        row.querySelectorAll(".hprt-breakfast-info, .hp-extras-option-text").forEach((el) => {
          const t = el.textContent?.trim();
          if (t && t.length < 80 && !inclusions.includes(t)) inclusions.push(t);
        });

        const cancelEl = row.querySelector(
          "[class*='hprt-cancellation'] [class*='policy'], [data-testid='cancellation-policy'], .hprt-free-cancel, [class*='free-cancel']"
        );
        rooms.push({ roomType, price2Pax: Math.round(price), inclusions, cancellation: cancelEl?.textContent?.trim() });
      });

      // Strategy 2: new Booking.com layout (data-testid based)
      if (rooms.length === 0) {
        document.querySelectorAll("[data-testid='property-section--room-type']").forEach((block) => {
          const roomType = block.querySelector("[data-testid='header-room-name']")?.textContent?.trim() ?? "";
          // Try attribute first, then text
          const priceRow = block.querySelector("tr[data-hotel-rounded-price]");
          const attrPrice = priceRow ? parseInt((priceRow as HTMLElement).dataset.hotelRoundedPrice ?? "", 10) : 0;
          let price = attrPrice > 0 ? attrPrice : 0;
          if (!price) {
            const rawPrice = (
              block.querySelector("[data-testid='price-and-discounts-price'], .bui-price-display__value")
            )?.textContent?.trim() ?? "";
            price = rawPrice ? parseFloat(rawPrice.replace(/[^\d,.]/g, "").replace(",", ".")) || 0 : 0;
          }
          const inclusions: string[] = [];
          block.querySelectorAll("[data-testid='facility-group'] li").forEach((li) => {
            const t = li.textContent?.trim();
            if (t && t.length < 80) inclusions.push(t);
          });
          const cancelEl = block.querySelector("[data-testid='cancellation-policy']");
          rooms.push({ roomType, price2Pax: Math.round(price), inclusions, cancellation: cancelEl?.textContent?.trim() });
        });
      }

      return rooms;
    });

    if (scraped.length === 0) return null;

    const cheapest = scraped
      .filter((r) => r.price2Pax && r.price2Pax > 0)
      .sort((a, b) => (a.price2Pax ?? 0) - (b.price2Pax ?? 0))[0];

    if (!cheapest) return null;

    const price2Pax = cheapest.price2Pax ?? 0;
    const price1Pax = Math.round(price2Pax * 0.88);

    return {
      name: hotel.name,
      bookingUrl: hotel.bookingUrl,
      price1Pax,
      price2Pax,
      fee: 0,
      finalPrice1Pax: price1Pax,
      finalPrice2Pax: price2Pax,
      inclusions: cheapest.inclusions.slice(0, 5),
      roomType: cheapest.roomType || undefined,
      cancellation: cheapest.cancellation || undefined,
    };
  } catch {
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const modeStr = dryRun ? "[DRY RUN] " : "";
  const rangeStr = datePairs.length === 1
    ? `${datePairs[0].checkin} → ${datePairs[0].checkout}`
    : `${datePairs[0].checkin} → ${datePairs[datePairs.length - 1].checkin} (${datePairs.length} datas, passo ${stepDays}d${weekendsOnly ? ", fins de semana" : ""})`;
  const adultsStr = adultsBoth ? "1 + 2 adultos" : `${adults} adulto(s)`;

  console.log(`\n🔍 ${modeStr}${hotels.length} hotel(s) × ${datePairs.length} data(s) × ${adultsStr}`);
  console.log(`   Período: ${rangeStr}\n`);

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--lang=pt-BR,pt"],
  });
  const context = await browser.newContext({
    locale: "pt-BR",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  await page.route("**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf}", (r) => r.abort());
  await page.route("**/analytics**", (r) => r.abort());
  await page.route("**/tracking**", (r) => r.abort());

  let totalSaved = 0;

  for (let di = 0; di < datePairs.length; di++) {
    const { checkin, checkout } = datePairs[di];
    const dateLabel = `[${String(di + 1).padStart(2, "0")}/${datePairs.length}] ${checkin}`;
    console.log(`\n📅 ${dateLabel}`);

    const entries: CompetitorEntry[] = [];

    for (let hi = 0; hi < hotels.length; hi++) {
      const hotel = hotels[hi];
      process.stdout.write(`  [${String(hi + 1).padStart(2, "0")}/${hotels.length}] ${hotel.name}... `);

      let entry: CompetitorEntry | null = null;

      if (adultsBoth) {
        // Scrape for 2 adults first, then 1 adult, combine into one entry
        const entry2 = await scrapeHotel(page, hotel, checkin, checkout);
        await page.waitForTimeout(800 + Math.random() * 500);
        // Temporarily set adults=1 for the second request
        const url1 = buildUrl(hotel.bookingUrl, checkin, checkout).replace(
          "group_adults=2", "group_adults=1"
        );
        let price1Pax = 0;
        try {
          await page.goto(url1, { waitUntil: "domcontentloaded", timeout: 30_000 });
          await page.waitForSelector(".hprt-table, [data-testid='availability-and-prices-table']", { timeout: 15_000 }).catch(() => null);
          await page.waitForTimeout(1500);
          price1Pax = await page.evaluate(() => {
            const priceEl = document.querySelector(
              ".hprt-table .prco-valign-middle-helper, .hprt-table .bui-price-display__value, [data-testid='price-and-discounts-price']"
            );
            const raw = priceEl?.textContent?.trim() ?? "";
            return raw ? Math.round(parseFloat(raw.replace(/[^\d,]/g, "").replace(",", ".")) || 0) : 0;
          });
        } catch { /* keep 0 */ }

        if (entry2) {
          entry = {
            ...entry2,
            price1Pax: price1Pax || Math.round(entry2.price2Pax * 0.88),
            finalPrice1Pax: price1Pax || Math.round(entry2.price2Pax * 0.88),
          };
        }
      } else {
        entry = await scrapeHotel(page, hotel, checkin, checkout);
      }

      if (entry) {
        entries.push(entry);
        const incl = entry.inclusions?.length ? ` | ${entry.inclusions.slice(0, 2).join(", ")}` : "";
        const p1str = adultsBoth ? ` / 1px: R$ ${entry.finalPrice1Pax.toLocaleString("pt-BR")}` : "";
        console.log(`2px: R$ ${entry.finalPrice2Pax.toLocaleString("pt-BR")}${p1str}${incl}`);
      } else {
        console.log("sem dados");
      }
      if (hi < hotels.length - 1) await page.waitForTimeout(1000 + Math.random() * 800);
    }

    console.log(`  → ${entries.length}/${hotels.length} hotéis com preço`);

    if (!dryRun && entries.length > 0) {
      const now = new Date().toISOString();
      const sample: Omit<CompetitorSample, "id"> = {
        date: checkin,
        checkin,
        checkout,
        competitors: entries,
        notes: `Scraping automático — ${adultsBoth ? "1 e 2 adultos" : `${adults} adulto(s)`}`,
        createdAt: now,
        scrapedAt: now,
      };
      const ref = await db!.collection("competitor_samples").add(sample);
      console.log(`  ✅ Salvo: competitor_samples/${ref.id}`);
      totalSaved++;
    }

    // Pause between dates to avoid rate limiting
    if (di < datePairs.length - 1) await page.waitForTimeout(2000);
  }

  await browser.close();

  if (dryRun) {
    console.log("\n── DRY RUN concluído — nenhum dado salvo ──");
  } else {
    console.log(`\n✅ Scraping concluído: ${totalSaved}/${datePairs.length} amostras salvas no Firestore`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error("❌ Erro fatal:", e.message);
  process.exit(1);
});

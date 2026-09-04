/**
 * Scraper de preços de concorrentes via Booking.com (Playwright/Chromium).
 *
 * Flags:
 *   --checkin / --checkout | --period-start / --period-end
 *   --step, --weekends-only, --dry-run
 *   --hotel <id> | --hotels id1,id2
 *   --adults 1|2|both
 */

import { chromium, type Browser } from "playwright";
import * as admin from "firebase-admin";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env"), quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });

import { COMPETITOR_URLS } from "../src/data/competitors";
import type { CompetitorEntry, CompetitorSample } from "../src/types";

const args = process.argv.slice(2);
const getArg = (flag: string) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : undefined;
};

const singleCheckin = getArg("--checkin");
const singleCheckout = getArg("--checkout");
const periodStart = getArg("--period-start");
const periodEnd = getArg("--period-end");
const stepDays = parseInt(getArg("--step") ?? "1", 10);
const weekendsOnly = args.includes("--weekends-only");
const dryRun = args.includes("--dry-run");
const hotelFilter = getArg("--hotel");
const hotelsFilterRaw = getArg("--hotels");
const hotelIds = [
  ...(hotelFilter ? [hotelFilter] : []),
  ...(hotelsFilterRaw ? hotelsFilterRaw.split(",").map((s) => s.trim()).filter(Boolean) : []),
];
const adultsArg = getArg("--adults") ?? "2";
const adultsBoth = adultsArg === "both";
const adults = adultsBoth ? 2 : parseInt(adultsArg, 10);

interface DatePair {
  checkin: string;
  checkout: string;
}

function addDays(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isWeekend(dateISO: string): boolean {
  const dow = new Date(dateISO + "T12:00:00Z").getUTCDay();
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
  process.exit(1);
}

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

const uniqueHotelIds = [...new Set(hotelIds)];
const hotels =
  uniqueHotelIds.length > 0
    ? COMPETITOR_URLS.filter((h) => uniqueHotelIds.includes(h.id))
    : COMPETITOR_URLS.filter((h) => h.active);

if (hotels.length === 0) {
  console.error(
    uniqueHotelIds.length
      ? `❌ Nenhum hotel encontrado para: ${uniqueHotelIds.join(", ")}`
      : "❌ Nenhum hotel ativo na lista COMPETITOR_URLS"
  );
  process.exit(1);
}

function buildUrl(baseUrl: string, checkin: string, checkout: string, adultsCount: number): string {
  const url = new URL(baseUrl);
  url.searchParams.set("checkin", checkin);
  url.searchParams.set("checkout", checkout);
  url.searchParams.set("group_adults", String(adultsCount));
  url.searchParams.set("no_rooms", "1");
  url.searchParams.set("group_children", "0");
  url.searchParams.set("selected_currency", "BRL");
  url.searchParams.set("do_availability_check", "1");
  url.searchParams.set("_", `${adultsCount}${Date.now().toString().slice(-6)}`);
  return url.toString();
}

/** 1 pax deve ser ≥5% abaixo de 2 pax. Se Booking vier igual/próximo, aplica o piso. */
function resolvePrice1Pax(raw1: number, price2: number): { price: number; source: "booking" | "estimado" } {
  if (!price2 || price2 <= 0) {
    return raw1 > 0 ? { price: raw1, source: "booking" } : { price: 0, source: "estimado" };
  }
  const maxAllowed = Math.round(price2 * 0.95); // pelo menos 5% a menos
  if (!raw1 || raw1 <= 0) {
    return { price: Math.min(maxAllowed, Math.round(price2 * 0.88)), source: "estimado" };
  }
  // Absurdo (taxa/fee) → estimado
  if (raw1 < price2 * 0.45) {
    return { price: Math.min(maxAllowed, Math.round(price2 * 0.88)), source: "estimado" };
  }
  // Igual, maior ou com menos de 5% de diferença → força piso de −5%
  if (raw1 > maxAllowed) {
    return { price: maxAllowed, source: "estimado" };
  }
  return { price: raw1, source: "booking" };
}

/** Uma page/context nova por ocupação — evita misturar 1px e 2px no mesmo DOM. */
async function scrapeHotel(
  browser: Browser,
  hotel: (typeof COMPETITOR_URLS)[number],
  checkin: string,
  checkout: string,
  adultsCount: number
): Promise<CompetitorEntry | null> {
  const context = await browser.newContext({
    locale: "pt-BR",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  try {
    await page.route("**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf}", (r) => r.abort());
    await page.route("**/analytics**", (r) => r.abort());
    await page.route("**/tracking**", (r) => r.abort());

    const targetUrl = buildUrl(hotel.bookingUrl, checkin, checkout, adultsCount);
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page
      .waitForSelector(".prco-valign-middle-helper, .hprt-table", { timeout: 15_000 })
      .catch(() => null);

    await page
      .waitForFunction(
        (n) => location.href.includes("group_adults=" + n) && document.querySelectorAll(".prco-valign-middle-helper").length > 0,
        adultsCount,
        { timeout: 15_000 }
      )
      .catch(() => null);

    await page.waitForTimeout(2500);

    // String evaluate — evita __name do tsx no browser
    const result = (await page.evaluate(`(() => {
      function parseBrl(text) {
        var cleaned = String(text || "").replace(/\\u00a0/g, " ").replace(/[^\\d,.]/g, "").trim();
        if (!cleaned) return 0;
        if (cleaned.indexOf(",") >= 0 && cleaned.indexOf(".") >= 0) {
          return Math.round(parseFloat(cleaned.replace(/\\./g, "").replace(",", ".")) || 0);
        }
        if (cleaned.indexOf(",") >= 0) {
          return Math.round(parseFloat(cleaned.replace(",", ".")) || 0);
        }
        return Math.round(parseFloat(cleaned) || 0);
      }

      var vals = [];
      document.querySelectorAll(".prco-valign-middle-helper").forEach(function (el) {
        var p = parseBrl(el.textContent || "");
        if (p > 50) vals.push(p);
      });
      vals.sort(function (a, b) { return a - b; });

      var roomType = "";
      var typeEl = document.querySelector(".hprt-roomtype-icon-link, .hprt-roomtype-link, [data-testid='header-room-name']");
      if (typeEl && typeEl.textContent) roomType = typeEl.textContent.trim();

      var urlAdults = (location.search.match(/group_adults=\\d+/) || [])[0] || "";
      return {
        minPrice: vals.length ? vals[0] : 0,
        vals: vals.slice(0, 4),
        roomType: roomType || "Quarto",
        urlAdults: urlAdults
      };
    })()`)) as { minPrice: number; vals: number[]; roomType: string; urlAdults: string };

    if (!result?.minPrice) return null;

    if (result.urlAdults && result.urlAdults !== `group_adults=${adultsCount}`) {
      console.warn(`  ⚠ pediu adults=${adultsCount} mas URL=${result.urlAdults}`);
    }

    const price = result.minPrice;
    return {
      name: hotel.name,
      bookingUrl: hotel.bookingUrl,
      price1Pax: price,
      price2Pax: price,
      fee: 0,
      finalPrice1Pax: price,
      finalPrice2Pax: price,
      inclusions: [],
      roomType: result.roomType || undefined,
    };
  } catch (err) {
    console.error(
      `  ⚠ scrapeHotel falhou (${hotel.name}, ${adultsCount} adult(s)):`,
      err instanceof Error ? err.message : err
    );
    return null;
  } finally {
    await context.close().catch(() => null);
  }
}

async function main() {
  const modeStr = dryRun ? "[DRY RUN] " : "";
  const rangeStr =
    datePairs.length === 1
      ? `${datePairs[0].checkin} → ${datePairs[0].checkout}`
      : `${datePairs[0].checkin} → ${datePairs[datePairs.length - 1].checkin} (${datePairs.length} datas)`;
  const adultsStr = adultsBoth ? "1 + 2 adultos" : `${adults} adulto(s)`;

  console.log(`\n🔍 ${modeStr}${hotels.length} hotel(s) × ${datePairs.length} data(s) × ${adultsStr}`);
  console.log(`   Período: ${rangeStr}\n`);

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--lang=pt-BR,pt"],
  });

  let totalSaved = 0;

  for (let di = 0; di < datePairs.length; di++) {
    const { checkin, checkout } = datePairs[di];
    console.log(`\n📅 [${String(di + 1).padStart(2, "0")}/${datePairs.length}] ${checkin}`);

    const entries: CompetitorEntry[] = [];
    let sampleId: string | null = null;

    for (let hi = 0; hi < hotels.length; hi++) {
      const hotel = hotels[hi];
      process.stdout.write(`  [${String(hi + 1).padStart(2, "0")}/${hotels.length}] ${hotel.name}... `);

      let entry: CompetitorEntry | null = null;

      if (adultsBoth) {
        const entry2 = await scrapeHotel(browser, hotel, checkin, checkout, 2);
        await new Promise((r) => setTimeout(r, 800));
        const entry1 = await scrapeHotel(browser, hotel, checkin, checkout, 1);

        const price2 = entry2?.price2Pax ?? 0;
        const price1Raw = entry1?.price2Pax ?? entry1?.price1Pax ?? 0;
        const resolved = resolvePrice1Pax(price1Raw, price2);

        if (entry2 && price2 > 0) {
          entry = {
            name: entry2.name,
            bookingUrl: entry2.bookingUrl,
            price1Pax: resolved.price,
            price2Pax: price2,
            fee: 0,
            finalPrice1Pax: resolved.price,
            finalPrice2Pax: price2,
            inclusions: entry2.inclusions,
            roomType: entry2.roomType,
            cancellation: entry2.cancellation,
          };
          if (resolved.price === price2) {
            console.warn(`  ⚠ 1px=2px=R$ ${price2} (raw1=${price1Raw})`);
          }
        }
      } else {
        const scraped = await scrapeHotel(browser, hotel, checkin, checkout, adults);
        if (scraped) {
          if (adults === 1) {
            entry = {
              ...scraped,
              price1Pax: scraped.price2Pax,
              finalPrice1Pax: scraped.price2Pax,
              price2Pax: 0,
              finalPrice2Pax: 0,
            };
          } else {
            entry = {
              ...scraped,
              price1Pax: 0,
              finalPrice1Pax: 0,
            };
          }
        }
      }

      if (entry) {
        entries.push(entry);
        const p1 =
          adultsBoth || adults === 1
            ? ` / 1px: R$ ${entry.finalPrice1Pax.toLocaleString("pt-BR")}`
            : "";
        console.log(`2px: R$ ${entry.finalPrice2Pax.toLocaleString("pt-BR")}${p1}`);

        if (!dryRun) {
          const now = new Date().toISOString();
          const stillRunning = hi < hotels.length - 1;
          const samplePayload: Omit<CompetitorSample, "id"> = {
            date: checkin,
            checkin,
            checkout,
            competitors: [...entries],
            notes: stillRunning
              ? `Coleta em andamento — ${entries.length}/${hotels.length} hotéis (${adultsBoth ? "1 e 2 adultos" : `${adults} adulto(s)`})`
              : `Coleta automática — ${adultsBoth ? "1 e 2 adultos" : `${adults} adulto(s)`}`,
            createdAt: now,
            scrapedAt: now,
          };
          if (!sampleId) {
            const ref = await db!.collection("competitor_samples").add(samplePayload);
            sampleId = ref.id;
            totalSaved++;
            console.log(`  ↳ liberado: competitor_samples/${sampleId}`);
          } else {
            await db!.collection("competitor_samples").doc(sampleId).update({
              competitors: samplePayload.competitors,
              notes: samplePayload.notes,
              scrapedAt: now,
            });
          }
        }
      } else {
        console.log("sem dados");
      }

      if (hi < hotels.length - 1) await new Promise((r) => setTimeout(r, 1000));
    }

    console.log(`  → ${entries.length}/${hotels.length} hotéis com preço`);
    if (di < datePairs.length - 1) await new Promise((r) => setTimeout(r, 2000));
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

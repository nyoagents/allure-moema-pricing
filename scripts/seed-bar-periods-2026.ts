/**
 * Popula bar_periods no Firestore com níveis BAR calibrados para 2026,
 * alinhados com os preços reais do Allure no Booking.com (verificados em julho/2026).
 *
 * Mapeamento usado:
 *   BAR 14 → standard sem_café 2pax = R$384,57  (Booking jul = R$386)
 *   BAR 12 → R$431,74                            (baixa temporada)
 *   BAR 10 → R$488,80                            (ombro)
 *   BAR  9 → R$521,68  (Booking ago/dez = R$511)
 *
 * Uso:
 *   npx tsx scripts/seed-bar-periods-2026.ts
 *   npx tsx scripts/seed-bar-periods-2026.ts --clear   (apaga períodos 2026 antes)
 */

import * as admin from "firebase-admin";
import * as dotenv from "dotenv";
import * as path from "path";
import type { Season } from "../src/types";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error("❌ Variáveis Firebase não encontradas.");
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }) });
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

function barToSeason(bar: number): Season {
  if (bar <= 2) return "alta";
  if (bar <= 4) return "media";
  if (bar <= 6) return "normal";
  return "baixa";
}

// Standard sem_café 2pax reference prices from BAR table
// BAR  9 → R$521,68   BAR 10 → R$488,80   BAR 12 → R$431,74   BAR 14 → R$384,57
interface Period {
  startDate: string;
  endDate: string;
  barLevel: number;
  notes: string;
}

// Calibrated from Booking.com Allure prices observed in Jul-2026
const PERIODS_2026: Period[] = [
  // ── Jan–Mar: pós-reveillon, baixa/ombro ──────────────────────────────────
  { startDate: "2026-01-01", endDate: "2026-01-06", barLevel: 9,  notes: "Reveillon final (alta)" },
  { startDate: "2026-01-07", endDate: "2026-01-31", barLevel: 12, notes: "Janeiro baixa" },
  { startDate: "2026-02-01", endDate: "2026-02-28", barLevel: 12, notes: "Fevereiro baixa" },
  { startDate: "2026-03-01", endDate: "2026-03-31", barLevel: 12, notes: "Março ombro" },

  // ── Abr–Jun: temporada normal ─────────────────────────────────────────────
  { startDate: "2026-04-01", endDate: "2026-04-30", barLevel: 12, notes: "Abril ombro" },
  { startDate: "2026-05-01", endDate: "2026-05-31", barLevel: 12, notes: "Maio baixa" },
  { startDate: "2026-06-01", endDate: "2026-06-30", barLevel: 12, notes: "Junho baixa" },

  // ── Jul: preço Booking ~R$386 → BAR 14 ────────────────────────────────────
  { startDate: "2026-07-01", endDate: "2026-07-31", barLevel: 14, notes: "Julho (calibrado Booking = R$386)" },

  // ── Ago: preço Booking ~R$511 → BAR 9 ─────────────────────────────────────
  { startDate: "2026-08-01", endDate: "2026-08-31", barLevel: 9,  notes: "Agosto (calibrado Booking = R$511)" },

  // ── Set–Out: ombro de alta ────────────────────────────────────────────────
  { startDate: "2026-09-01", endDate: "2026-09-30", barLevel: 10, notes: "Setembro ombro" },
  { startDate: "2026-10-01", endDate: "2026-10-31", barLevel: 11, notes: "Outubro ombro" },

  // ── Nov: baixa pre-natal ──────────────────────────────────────────────────
  { startDate: "2026-11-01", endDate: "2026-11-30", barLevel: 12, notes: "Novembro baixa" },

  // ── Dez: crescendo até o pico de réveillon ────────────────────────────────
  { startDate: "2026-12-01", endDate: "2026-12-19", barLevel: 9,  notes: "Dezembro alta (calibrado Booking = R$511)" },
  { startDate: "2026-12-20", endDate: "2026-12-31", barLevel: 6,  notes: "Reveillon 2026 (alta)" },
];

async function seed() {
  const clearMode = process.argv.includes("--clear");
  console.log(`\n📅 Seed bar_periods 2026 → Firestore (${projectId})\n`);

  if (clearMode) {
    console.log("⚠️  --clear: apagando períodos existentes em 2026...");
    const snap = await db.collection("bar_periods").orderBy("startDate").get();
    const to2026 = snap.docs.filter(
      (d) => d.data().startDate?.startsWith("2026") || d.data().endDate?.startsWith("2026")
    );
    const delBatch = db.batch();
    to2026.forEach((d) => delBatch.delete(d.ref));
    await delBatch.commit();
    console.log(`  → ${to2026.length} registros removidos\n`);
  }

  const batch = db.batch();
  for (const p of PERIODS_2026) {
    const ref = db.collection("bar_periods").doc();
    const season = barToSeason(p.barLevel);
    batch.set(ref, {
      startDate: p.startDate,
      endDate: p.endDate,
      barLevel: p.barLevel,
      season,
      notes: p.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    console.log(`  ${p.startDate} → ${p.endDate}  BAR ${String(p.barLevel).padStart(2)} (${season.padEnd(6)})  ${p.notes}`);
  }
  await batch.commit();

  console.log(`\n✅ ${PERIODS_2026.length} períodos salvos na coleção bar_periods`);
  console.log("   O calendário agora reflete os preços reais observados no Booking.com.\n");
  process.exit(0);
}

seed().catch((e) => {
  console.error("❌ Erro:", e.message);
  process.exit(1);
});

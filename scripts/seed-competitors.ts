/**
 * Popula:
 *   /competitor_samples  — 3 amostras históricas da planilha
 *   /competitor_urls     — 19 hotéis monitorados no Booking.com
 *
 * Uso:
 *   npx tsx scripts/seed-competitors.ts
 */

import * as admin from "firebase-admin";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error("❌ Variáveis de ambiente Firebase não encontradas.");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
});

const db = admin.firestore();

import { COMPETITOR_SAMPLES, COMPETITOR_URLS } from "../src/data/competitors";

async function seed() {
  console.log(`🏨 Seed de concorrentes → Firestore (${projectId})\n`);

  // ── 1. Amostras históricas ──────────────────────────────────────────────────
  console.log("📊 Amostras históricas (competitor_samples):");
  const sampleBatch = db.batch();
  for (const sample of COMPETITOR_SAMPLES) {
    const { id, ...data } = sample;
    const ref = db.collection("competitor_samples").doc(id);
    sampleBatch.set(ref, { ...data, seeded: true });
    console.log(
      `  ✓ ${id} (${sample.date}) — ${sample.competitors.length} concorrentes`
    );
  }
  await sampleBatch.commit();
  console.log(`  → ${COMPETITOR_SAMPLES.length} amostras salvas.\n`);

  // ── 2. URLs dos concorrentes monitorados ────────────────────────────────────
  console.log("🔗 URLs monitoradas (competitor_urls):");
  const urlBatch = db.batch();
  for (const hotel of COMPETITOR_URLS) {
    const { id, ...data } = hotel;
    const ref = db.collection("competitor_urls").doc(id);
    urlBatch.set(ref, { ...data, seededAt: new Date().toISOString() });
    const status = hotel.active ? "✓" : "○";
    console.log(`  ${status} ${id} — ${hotel.name}`);
  }
  await urlBatch.commit();
  console.log(`  → ${COMPETITOR_URLS.length} hotéis salvos.\n`);

  console.log("✅ Seed concluído!");
  process.exit(0);
}

seed().catch((e) => {
  console.error("❌ Erro:", e.message);
  process.exit(1);
});

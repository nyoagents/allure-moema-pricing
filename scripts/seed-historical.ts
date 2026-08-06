/**
 * Popula a coleção /historical_data no Firestore com 357 dias de dados (2023-2024).
 * Origem: planilha "Calendário 2024" — inclui nível BAR diário, preço Standard Allure
 * e preço do concorrente BIBIC quando disponível.
 *
 * Uso:
 *   npx tsx scripts/seed-historical.ts
 *
 * Usa batch writes (máx 500 por batch) para eficiência.
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
db.settings({ ignoreUndefinedProperties: true });

// 357 days of historical data extracted from spreadsheet (2023-04-03 to 2024-04-02)
// Format: [date, month, year, dayOfWeek, barLevel, allureStandardPrice, bibicPrice?]
// Source: "Calendário 2024" sheet — BIBIC competitor + Standard price + BAR level per day
import { HISTORICAL_DATA } from "../src/data/historical-calendar";

async function seed() {
  console.log(`📅 Seed de dados históricos → Firestore (${projectId})\n`);
  console.log(`   Registros: ${HISTORICAL_DATA.length} dias (2023-04-03 a 2024-04-02)\n`);

  const BATCH_SIZE = 499;
  let batch = db.batch();
  let count = 0;
  let batchCount = 0;

  for (const record of HISTORICAL_DATA) {
    const docId = record.date.replace(/-/g, "");
    const ref = db.collection("historical_data").doc(docId);
    batch.set(ref, {
      ...record,
      createdAt: new Date().toISOString(),
    });
    count++;

    if (count % BATCH_SIZE === 0) {
      await batch.commit();
      batchCount++;
      console.log(`  ✓ Batch ${batchCount}: ${count} registros salvos...`);
      batch = db.batch();
    }
  }

  if (count % BATCH_SIZE !== 0) {
    await batch.commit();
    console.log(`  ✓ Batch final: ${count} registros salvos`);
  }

  console.log(`\n✅ ${count} registros históricos salvos no Firestore!`);
  console.log("   Coleção: historical_data");
  console.log("   ID do documento: YYYYMMDD (ex: 20231225)");
  console.log("   Campos: date, month, year, dayOfWeek, barLevel, allureStandardPrice, bibicPrice");
  process.exit(0);
}

seed().catch((e) => {
  console.error("❌ Erro:", e.message);
  process.exit(1);
});

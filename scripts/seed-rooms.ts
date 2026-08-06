/**
 * Popula a coleção /rooms no Firestore com as 6 tipologias do Allure Moema.
 *
 * Uso:
 *   npx tsx scripts/seed-rooms.ts
 *
 * Requer no .env:
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
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
  console.error("   Configure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY no .env");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
});

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

const ROOMS = [
  {
    id: "standard",
    name: "Studio Standard",
    sqm: 20,
    maxGuests: 2,
    stayType: "both",
    description: "Sacada fechada, cama casal. Ideal para estadias curtas e longas.",
    order: 1,
  },
  {
    id: "select",
    name: "Studio Select",
    sqm: 25,
    maxGuests: 2,
    stayType: "short",
    description: "Queen size, mesa de trabalho. O mais procurado para short stay.",
    order: 2,
  },
  {
    id: "standard-garden",
    name: "Studio Standard Garden",
    sqm: 29,
    maxGuests: 2,
    stayType: "long",
    description: "Varanda estendida com vista para área verde.",
    order: 3,
  },
  {
    id: "select-garden",
    name: "Studio Select Garden",
    sqm: 39,
    maxGuests: 2,
    stayType: "long",
    description: "Maior studio com varanda garden. Long stay premium.",
    order: 4,
  },
  {
    id: "select-plus",
    name: "Studio Select Plus",
    sqm: 25,
    maxGuests: 2,
    stayType: "short",
    description: "Queen ou 2 camas solteiro. Flexibilidade de configuração.",
    order: 5,
  },
  {
    id: "suite",
    name: "Suite",
    sqm: 50,
    maxGuests: 4,
    stayType: "long",
    description: "Queen + 2 solteiros. Para famílias ou estadias executivas longas.",
    order: 6,
  },
];

async function seed() {
  console.log(`🏨 Seed de quartos → Firestore (${projectId})\n`);
  const batch = db.batch();

  for (const room of ROOMS) {
    const { id, ...data } = room;
    const ref = db.collection("rooms").doc(id);
    batch.set(ref, { ...data, updatedAt: new Date().toISOString() });
    console.log(`  ✓ rooms/${id} — ${room.name} (${room.sqm}m²)`);
  }

  await batch.commit();
  console.log(`\n✅ ${ROOMS.length} quartos salvos no Firestore!`);
  process.exit(0);
}

seed().catch((e) => {
  console.error("❌ Erro:", e.message);
  process.exit(1);
});

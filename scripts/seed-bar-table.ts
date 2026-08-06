/**
 * Popula a coleção /bar_rates no Firestore com a tabela BAR completa.
 * Um documento por tipologia de quarto.
 *
 * Uso:
 *   npx tsx scripts/seed-bar-table.ts
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

// BAR rates extracted from spreadsheet "TARIFÁRIO" (Allure 2023-2024)
// Keys: room_id → BAR level (as string) → { sem_cafe_1pax, sem_cafe_2pax, com_cafe_1pax, com_cafe_2pax }
// Full range BAR -9 to BAR 17. Operational range: BAR 1 to BAR 10.
const BAR_RATES: Record<string, Record<string, Record<string, number>>> = {
  "standard": {
    "1": { "sem_cafe_1pax": 806.08, "sem_cafe_2pax": 935.29, "com_cafe_1pax": 957.69, "com_cafe_2pax": 1047.69 },
    "2": { "sem_cafe_1pax": 747.34, "sem_cafe_2pax": 864.81, "com_cafe_1pax": 887.21, "com_cafe_2pax": 977.21 },
    "3": { "sem_cafe_1pax": 693.95, "sem_cafe_2pax": 800.74, "com_cafe_1pax": 823.14, "com_cafe_2pax": 913.14 },
    "4": { "sem_cafe_1pax": 645.41, "sem_cafe_2pax": 742.49, "com_cafe_1pax": 764.89, "com_cafe_2pax": 854.89 },
    "5": { "sem_cafe_1pax": 601.28, "sem_cafe_2pax": 689.54, "com_cafe_1pax": 711.94, "com_cafe_2pax": 801.94 },
    "6": { "sem_cafe_1pax": 561.16, "sem_cafe_2pax": 641.4, "com_cafe_1pax": 663.8, "com_cafe_2pax": 753.8 },
    "7": { "sem_cafe_1pax": 524.69, "sem_cafe_2pax": 597.63, "com_cafe_1pax": 620.03, "com_cafe_2pax": 710.03 },
    "8": { "sem_cafe_1pax": 491.54, "sem_cafe_2pax": 557.85, "com_cafe_1pax": 580.25, "com_cafe_2pax": 670.25 },
    "9": { "sem_cafe_1pax": 461.4, "sem_cafe_2pax": 521.68, "com_cafe_1pax": 544.08, "com_cafe_2pax": 634.08 },
    "10": { "sem_cafe_1pax": 434.0, "sem_cafe_2pax": 488.8, "com_cafe_1pax": 511.2, "com_cafe_2pax": 601.2 },
  },
  "standard-garden": {
    "1": { "sem_cafe_1pax": 838.38, "sem_cafe_2pax": 974.06, "com_cafe_1pax": 996.46, "com_cafe_2pax": 1086.46 },
    "2": { "sem_cafe_1pax": 776.71, "sem_cafe_2pax": 900.05, "com_cafe_1pax": 922.45, "com_cafe_2pax": 1012.45 },
    "3": { "sem_cafe_1pax": 720.65, "sem_cafe_2pax": 832.78, "com_cafe_1pax": 855.18, "com_cafe_2pax": 945.18 },
    "4": { "sem_cafe_1pax": 669.68, "sem_cafe_2pax": 771.61, "com_cafe_1pax": 794.01, "com_cafe_2pax": 884.01 },
    "5": { "sem_cafe_1pax": 623.34, "sem_cafe_2pax": 716.01, "com_cafe_1pax": 738.41, "com_cafe_2pax": 828.41 },
    "6": { "sem_cafe_1pax": 581.22, "sem_cafe_2pax": 665.47, "com_cafe_1pax": 687.87, "com_cafe_2pax": 777.87 },
    "7": { "sem_cafe_1pax": 542.93, "sem_cafe_2pax": 619.51, "com_cafe_1pax": 641.91, "com_cafe_2pax": 731.91 },
    "8": { "sem_cafe_1pax": 508.12, "sem_cafe_2pax": 577.74, "com_cafe_1pax": 600.14, "com_cafe_2pax": 690.14 },
    "9": { "sem_cafe_1pax": 476.47, "sem_cafe_2pax": 539.76, "com_cafe_1pax": 562.16, "com_cafe_2pax": 652.16 },
    "10": { "sem_cafe_1pax": 447.7, "sem_cafe_2pax": 505.24, "com_cafe_1pax": 527.64, "com_cafe_2pax": 617.64 },
  },
  "select": {
    "1": { "sem_cafe_1pax": 902.99, "sem_cafe_2pax": 1051.59, "com_cafe_1pax": 1073.99, "com_cafe_2pax": 1163.99 },
    "2": { "sem_cafe_1pax": 835.44, "sem_cafe_2pax": 970.53, "com_cafe_1pax": 992.93, "com_cafe_2pax": 1082.93 },
    "3": { "sem_cafe_1pax": 774.04, "sem_cafe_2pax": 896.85, "com_cafe_1pax": 919.25, "com_cafe_2pax": 1009.25 },
    "4": { "sem_cafe_1pax": 718.22, "sem_cafe_2pax": 829.86, "com_cafe_1pax": 852.26, "com_cafe_2pax": 942.26 },
    "5": { "sem_cafe_1pax": 667.47, "sem_cafe_2pax": 768.97, "com_cafe_1pax": 791.37, "com_cafe_2pax": 881.37 },
    "6": { "sem_cafe_1pax": 621.34, "sem_cafe_2pax": 713.61, "com_cafe_1pax": 736.01, "com_cafe_2pax": 826.01 },
    "7": { "sem_cafe_1pax": 579.4, "sem_cafe_2pax": 663.28, "com_cafe_1pax": 685.68, "com_cafe_2pax": 775.68 },
    "8": { "sem_cafe_1pax": 541.27, "sem_cafe_2pax": 617.53, "com_cafe_1pax": 639.93, "com_cafe_2pax": 729.93 },
    "9": { "sem_cafe_1pax": 506.61, "sem_cafe_2pax": 575.93, "com_cafe_1pax": 598.33, "com_cafe_2pax": 688.33 },
    "10": { "sem_cafe_1pax": 475.1, "sem_cafe_2pax": 538.12, "com_cafe_1pax": 560.52, "com_cafe_2pax": 650.52 },
  },
  "select-garden": {
    "1": { "sem_cafe_1pax": 940.14, "sem_cafe_2pax": 1096.17, "com_cafe_1pax": 1118.57, "com_cafe_2pax": 1208.57 },
    "2": { "sem_cafe_1pax": 869.22, "sem_cafe_2pax": 1011.06, "com_cafe_1pax": 1033.46, "com_cafe_2pax": 1123.46 },
    "3": { "sem_cafe_1pax": 804.74, "sem_cafe_2pax": 933.69, "com_cafe_1pax": 956.09, "com_cafe_2pax": 1046.09 },
    "4": { "sem_cafe_1pax": 746.13, "sem_cafe_2pax": 863.36, "com_cafe_1pax": 885.76, "com_cafe_2pax": 975.76 },
    "5": { "sem_cafe_1pax": 692.85, "sem_cafe_2pax": 799.41, "com_cafe_1pax": 821.81, "com_cafe_2pax": 911.81 },
    "6": { "sem_cafe_1pax": 644.4, "sem_cafe_2pax": 741.29, "com_cafe_1pax": 763.69, "com_cafe_2pax": 853.69 },
    "7": { "sem_cafe_1pax": 600.37, "sem_cafe_2pax": 688.44, "com_cafe_1pax": 710.84, "com_cafe_2pax": 800.84 },
    "8": { "sem_cafe_1pax": 560.33, "sem_cafe_2pax": 640.4, "com_cafe_1pax": 662.8, "com_cafe_2pax": 752.8 },
    "9": { "sem_cafe_1pax": 523.94, "sem_cafe_2pax": 596.73, "com_cafe_1pax": 619.13, "com_cafe_2pax": 709.13 },
    "10": { "sem_cafe_1pax": 490.86, "sem_cafe_2pax": 557.03, "com_cafe_1pax": 579.43, "com_cafe_2pax": 669.43 },
  },
  "select-plus": {
    "1": { "sem_cafe_1pax": 977.29, "sem_cafe_2pax": 1140.75, "com_cafe_1pax": 1163.15, "com_cafe_2pax": 1253.15 },
    "2": { "sem_cafe_1pax": 902.99, "sem_cafe_2pax": 1051.59, "com_cafe_1pax": 1073.99, "com_cafe_2pax": 1163.99 },
    "3": { "sem_cafe_1pax": 835.44, "sem_cafe_2pax": 970.53, "com_cafe_1pax": 992.93, "com_cafe_2pax": 1082.93 },
    "4": { "sem_cafe_1pax": 774.04, "sem_cafe_2pax": 896.85, "com_cafe_1pax": 919.25, "com_cafe_2pax": 1009.25 },
    "5": { "sem_cafe_1pax": 718.22, "sem_cafe_2pax": 829.86, "com_cafe_1pax": 852.26, "com_cafe_2pax": 942.26 },
    "6": { "sem_cafe_1pax": 667.47, "sem_cafe_2pax": 768.97, "com_cafe_1pax": 791.37, "com_cafe_2pax": 881.37 },
    "7": { "sem_cafe_1pax": 621.34, "sem_cafe_2pax": 713.61, "com_cafe_1pax": 736.01, "com_cafe_2pax": 826.01 },
    "8": { "sem_cafe_1pax": 579.4, "sem_cafe_2pax": 663.28, "com_cafe_1pax": 685.68, "com_cafe_2pax": 775.68 },
    "9": { "sem_cafe_1pax": 541.27, "sem_cafe_2pax": 617.53, "com_cafe_1pax": 639.93, "com_cafe_2pax": 729.93 },
    "10": { "sem_cafe_1pax": 506.61, "sem_cafe_2pax": 575.93, "com_cafe_1pax": 598.33, "com_cafe_2pax": 688.33 },
  },
  "suite": {
    "1": { "sem_cafe_1pax": 1645.98, "sem_cafe_2pax": 1645.98, "com_cafe_1pax": 2335.17, "com_cafe_2pax": 2335.17 },
    "2": { "sem_cafe_1pax": 1510.89, "sem_cafe_2pax": 1510.89, "com_cafe_1pax": 2173.07, "com_cafe_2pax": 2173.07 },
    "3": { "sem_cafe_1pax": 1388.08, "sem_cafe_2pax": 1388.08, "com_cafe_1pax": 2025.7, "com_cafe_2pax": 2025.7 },
    "4": { "sem_cafe_1pax": 1276.44, "sem_cafe_2pax": 1276.44, "com_cafe_1pax": 1891.73, "com_cafe_2pax": 1891.73 },
    "5": { "sem_cafe_1pax": 1174.94, "sem_cafe_2pax": 1174.94, "com_cafe_1pax": 1769.93, "com_cafe_2pax": 1769.93 },
    "6": { "sem_cafe_1pax": 1082.68, "sem_cafe_2pax": 1082.68, "com_cafe_1pax": 1659.21, "com_cafe_2pax": 1659.21 },
    "7": { "sem_cafe_1pax": 998.8, "sem_cafe_2pax": 998.8, "com_cafe_1pax": 1558.56, "com_cafe_2pax": 1558.56 },
    "8": { "sem_cafe_1pax": 922.54, "sem_cafe_2pax": 922.54, "com_cafe_1pax": 1467.05, "com_cafe_2pax": 1467.05 },
    "9": { "sem_cafe_1pax": 853.22, "sem_cafe_2pax": 853.22, "com_cafe_1pax": 1383.86, "com_cafe_2pax": 1383.86 },
    "10": { "sem_cafe_1pax": 790.2, "sem_cafe_2pax": 790.2, "com_cafe_1pax": 1308.24, "com_cafe_2pax": 1308.24 },
  },
};

async function seed() {
  console.log(`💰 Seed de tabela BAR → Firestore (${projectId})\n`);
  const rooms = Object.keys(BAR_RATES);

  for (const roomId of rooms) {
    const rates = BAR_RATES[roomId];
    await db.collection("bar_rates").doc(roomId).set({
      roomId,
      rates,
      source: "planilha_2023_2024",
      updatedAt: new Date().toISOString(),
    });
    console.log(`  ✓ bar_rates/${roomId} — ${Object.keys(rates).length} níveis BAR`);
  }

  console.log(`\n✅ Tabela BAR salva para ${rooms.length} tipos de quarto!`);
  console.log("   Níveis operacionais: BAR 1 (mais caro) → BAR 10 (mais barato)");
  console.log("   BAR 5 = tarifa base padrão");
  process.exit(0);
}

seed().catch((e) => {
  console.error("❌ Erro:", e.message);
  process.exit(1);
});

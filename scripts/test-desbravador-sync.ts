/**
 * CLI Test Script for Desbravador Channel Manager Rate Sync
 *
 * Usage:
 *   npx ts-node scripts/test-desbravador-sync.ts --offset-cents 1
 *   npx ts-node scripts/test-desbravador-sync.ts --offset-cents -1
 *   npx ts-node scripts/test-desbravador-sync.ts --hml
 */

import {
  buildDesbravadorPayload,
  sendRatesToDesbravador,
  DESBRAVADOR_PLANS,
  DESBRAVADOR_CONFIG,
} from "../src/lib/desbravador";

async function main() {
  const args = process.argv.slice(2);
  const useHml = args.includes("--hml");
  const offsetIndex = args.indexOf("--offset-cents");
  const offsetCents = offsetIndex !== -1 ? parseInt(args[offsetIndex + 1], 10) : 1;

  const today = new Date().toISOString().split("T")[0];
  const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];

  console.log("=================================================");
  console.log("🏨 DESBRAVADOR CM RATE UPDATE TEST SCRIPT");
  console.log("=================================================");
  console.log(`Environment: ${useHml ? "HOMOLOGAÇÃO" : "PRODUÇÃO"}`);
  console.log(`URL: ${useHml ? DESBRAVADOR_CONFIG.HML_URL : DESBRAVADOR_CONFIG.PROD_URL}`);
  console.log(`Company ID: ${DESBRAVADOR_CONFIG.COMPANY_ID}`);
  console.log(`Channel ID: ${DESBRAVADOR_CONFIG.CHANNEL_ID}`);
  console.log(`Protocol: ${DESBRAVADOR_CONFIG.PROTOCOL}`);
  console.log(`Offset Test: ${offsetCents > 0 ? `+${offsetCents}` : offsetCents} centavos`);
  console.log(`Date Range: ${today} to ${nextMonth}`);
  console.log("-------------------------------------------------");

  const payload = buildDesbravadorPayload({
    startDate: today,
    endDate: nextMonth,
    planId: DESBRAVADOR_PLANS.WITHOUT_BREAKFAST.id,
    offsetCents,
  });

  console.log("\n📦 PAYLOAD ENVIADO:");
  console.log(JSON.stringify(payload, null, 2));

  console.log("\n🚀 Enviando requisição para Desbravador API...");
  const result = await sendRatesToDesbravador(payload, !useHml);

  console.log("\n=================================================");
  console.log(`STATUS CODE: ${result.statusCode}`);
  console.log(`TEMPO DE RESPOSTA: ${result.durationMs}ms`);
  console.log(`RESULTADO: ${result.success ? "✅ SUCESSO" : "❌ FALHA"}`);
  console.log("RESPOSTA BRUTA:");
  console.log(JSON.stringify(result.data, null, 2));
  console.log("=================================================");
}

main().catch((err) => {
  console.error("Fatal error running test script:", err);
  process.exit(1);
});

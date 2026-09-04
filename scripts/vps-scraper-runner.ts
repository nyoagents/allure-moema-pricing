/**
 * Hetzner VPS Scraper Runner
 *
 * Runs the competitor scraper on a VPS environment and supports cron invocation.
 *
 * Usage:
 *   npx tsx scripts/vps-scraper-runner.ts
 *   npx tsx scripts/vps-scraper-runner.ts --period-days 30 --step 2
 *   npx tsx scripts/vps-scraper-runner.ts --period-days 7 --hotels blue-tree-premium-morumbi,novotel-sao-paulo-berrini
 */

import { spawn } from "child_process";
import * as path from "path";

function run() {
  const args = process.argv.slice(2);
  const getArg = (flag: string) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };

  const periodDays = parseInt(getArg("--period-days") ?? "30", 10);
  const step = getArg("--step") ?? "2";
  const hotels = getArg("--hotels");
  const hotel = getArg("--hotel");

  const today = new Date();
  const startDate = today.toISOString().slice(0, 10);
  const endDate = new Date(today.getTime() + periodDays * 86400000).toISOString().slice(0, 10);

  console.log("==================================================");
  console.log("🚀 VPS SCRAPER RUNNER (CRON / STANDALONE)");
  console.log("==================================================");
  console.log(`Período: ${startDate} a ${endDate}`);
  console.log(`Passo: a cada ${step} dias`);
  console.log(`Hotéis: ${hotels || hotel || "todos ativos"}`);
  console.log("==================================================");

  const scriptPath = path.resolve(__dirname, "scrape-competitors.ts");
  const cliArgs = [
    "tsx",
    scriptPath,
    "--period-start",
    startDate,
    "--period-end",
    endDate,
    "--step",
    step,
    "--adults",
    "both",
  ];

  if (hotels) cliArgs.push("--hotels", hotels);
  else if (hotel) cliArgs.push("--hotel", hotel);

  const child = spawn("npx", cliArgs, {
    stdio: "inherit",
    env: process.env,
  });

  child.on("close", (code) => {
    console.log(`\nProcesso finalizado com código de saída: ${code}`);
    process.exit(code ?? 0);
  });
}

run();

/**
 * POST /api/competitors/scrape
 *
 * Triggers the Playwright scraper for a single date or a full period.
 * Requires admin session.
 *
 * Body (single date):
 *   { checkin: "YYYY-MM-DD", checkout: "YYYY-MM-DD", hotel?: string, adults?: 1|2 }
 *
 * Body (period):
 *   { periodStart: "YYYY-MM-DD", periodEnd: "YYYY-MM-DD", step?: number,
 *     weekendsOnly?: boolean, hotel?: string, adults?: 1|2 }
 *
 * NOTE: Only works on a self-hosted Node.js server.
 * Returns 503 on Vercel/serverless with CLI instructions.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { spawn } from "child_process";
import path from "path";
import { requireAdmin } from "@/lib/session";

const IS_SERVERLESS =
  !!process.env.VERCEL ||
  !!process.env.AWS_LAMBDA_FUNCTION_NAME ||
  !!process.env.CF_PAGES;

const DEMO_MODE = !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (IS_SERVERLESS) {
    return res.status(503).json({
      error: "Ambiente serverless detectado. Execute o scraper localmente:",
      cli: "npx tsx scripts/scrape-competitors.ts --period-start YYYY-MM-DD --period-end YYYY-MM-DD",
    });
  }

  if (DEMO_MODE) {
    return res.status(503).json({
      error: "Firebase não configurado (modo demo). Configure .env para usar o scraper.",
    });
  }

  const {
    // single date mode
    checkin,
    checkout,
    // period mode
    periodStart,
    periodEnd,
    step,
    weekendsOnly,
    // common
    hotel,
    adults,
  } = req.body as {
    checkin?: string;
    checkout?: string;
    periodStart?: string;
    periodEnd?: string;
    step?: number;
    weekendsOnly?: boolean;
    hotel?: string;
    adults?: number | "both";
  };

  // Validate: must have either single or period
  const isSingle = checkin && checkout;
  const isPeriod = periodStart && periodEnd;

  if (!isSingle && !isPeriod) {
    return res.status(400).json({
      error: "Informe checkin/checkout (diária única) ou periodStart/periodEnd (período)",
    });
  }

  const dateRx = /^\d{4}-\d{2}-\d{2}$/;
  const datesToCheck = [checkin, checkout, periodStart, periodEnd].filter(Boolean);
  if (datesToCheck.some((d) => !dateRx.test(d!))) {
    return res.status(400).json({ error: "Formato de data inválido. Use YYYY-MM-DD" });
  }

  // Build CLI args
  const scriptPath = path.join(process.cwd(), "scripts", "scrape-competitors.ts");
  const cliArgs: string[] = ["tsx", scriptPath];

  if (isSingle) {
    cliArgs.push("--checkin", checkin!, "--checkout", checkout!);
  } else {
    cliArgs.push("--period-start", periodStart!, "--period-end", periodEnd!);
    if (step && step > 1) cliArgs.push("--step", String(step));
    if (weekendsOnly) cliArgs.push("--weekends-only");
  }

  if (hotel) cliArgs.push("--hotel", hotel);
  if (adults) cliArgs.push("--adults", adults === "both" ? "both" : String(adults));

  // Stream NDJSON back to client
  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("X-Job-Id", `scrape-${Date.now()}`);
  res.flushHeaders();

  const write = (obj: Record<string, unknown>) => {
    if (!res.writableEnded) res.write(JSON.stringify(obj) + "\n");
  };

  write({
    type: "start",
    mode: isSingle ? "single" : "period",
    ...(isSingle ? { checkin, checkout } : { periodStart, periodEnd, step: step ?? 1, weekendsOnly: !!weekendsOnly }),
    hotel: hotel ?? "all",
    startedAt: new Date().toISOString(),
  });

  const child = spawn("npx", cliArgs, {
    cwd: process.cwd(),
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk: Buffer) => {
    chunk.toString().split("\n").filter(Boolean).forEach((line) => write({ type: "log", line }));
  });

  child.stderr.on("data", (chunk: Buffer) => {
    chunk.toString().split("\n").filter(Boolean).forEach((line) => write({ type: "error", line }));
  });

  child.on("close", (code) => {
    write({ type: "done", exitCode: code, success: code === 0, finishedAt: new Date().toISOString() });
    res.end();
  });

  child.on("error", (err) => {
    write({ type: "error", line: err.message });
    res.end();
  });
}

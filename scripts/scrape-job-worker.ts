/**
 * VPS scrape job worker (Projeto Y — Allure).
 * Polls Firestore scrape_jobs for status=pending, runs Playwright, streams logs back.
 *
 * Usage:
 *   tsx scripts/scrape-job-worker.ts
 *   SCRAPE_WORKER_POLL_MS=15000 tsx scripts/scrape-job-worker.ts
 */

import { spawn } from "child_process";
import * as path from "path";
import * as admin from "firebase-admin";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env"), quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), "deploy/vps/.env"), quiet: true });

const POLL_MS = parseInt(process.env.SCRAPE_WORKER_POLL_MS || "15000", 10);
const MAX_LOG_LINES = 250;

type Db = admin.firestore.Firestore;

function isNoisyLogLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  return (
    t.includes("injected env") ||
    t.includes("dotenvx.com") ||
    t.includes("tip:") ||
    t.startsWith("◇") ||
    t.startsWith("◈") ||
    t.startsWith("◆") ||
    /DeprecationWarning/.test(t)
  );
}

function initDb(): Db {
  if (admin.apps.length) return admin.firestore();
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin env vars missing for scrape-job-worker");
  }
  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
  const db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

async function appendLog(db: Db, jobId: string, line: string, extra: Record<string, unknown> = {}) {
  const ref = db.collection("scrape_jobs").doc(jobId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const data = snap.data() || {};
    // Não regride progresso nem altera % depois de done/error
    if (data.status === "done" || data.status === "error") {
      const logs: string[] = Array.isArray(data.logs) ? [...data.logs, line] : [line];
      const trimmed = logs.length > MAX_LOG_LINES ? logs.slice(-MAX_LOG_LINES) : logs;
      tx.update(ref, { logs: trimmed, updatedAt: new Date().toISOString() });
      return;
    }
    const logs: string[] = Array.isArray(data.logs) ? [...data.logs, line] : [line];
    const trimmed = logs.length > MAX_LOG_LINES ? logs.slice(-MAX_LOG_LINES) : logs;
    const patch: Record<string, unknown> = {
      logs: trimmed,
      updatedAt: new Date().toISOString(),
      ...extra,
    };
    if (typeof extra.progressPercent === "number") {
      const prev = Number(data.progressPercent || 0);
      patch.progressPercent = Math.max(prev, Math.min(99, extra.progressPercent));
    }
    tx.update(ref, patch);
  });
}

function buildCliArgs(params: Record<string, unknown>): string[] {
  const scriptPath = path.resolve(process.cwd(), "scripts", "scrape-competitors.ts");
  const args = [scriptPath];
  if (params.mode === "single") {
    args.push("--checkin", String(params.checkin), "--checkout", String(params.checkout));
  } else {
    args.push("--period-start", String(params.periodStart), "--period-end", String(params.periodEnd));
    const step = Number(params.step || 1);
    if (step > 1) args.push("--step", String(step));
    if (params.weekendsOnly) args.push("--weekends-only");
  }
  const hotelIds = Array.isArray(params.hotelIds) ? (params.hotelIds as string[]) : [];
  if (hotelIds.length === 1) args.push("--hotel", hotelIds[0]);
  else if (hotelIds.length > 1) args.push("--hotels", hotelIds.join(","));
  const adults = params.adults ?? "both";
  args.push("--adults", adults === "both" ? "both" : String(adults));
  return args;
}

async function claimNextJob(db: Db) {
  const snap = await db.collection("scrape_jobs").where("status", "==", "pending").limit(10).get();
  if (snap.empty) return null;
  const sorted = [...snap.docs].sort((a, b) => {
    const ca = String(a.data().createdAt || "");
    const cb = String(b.data().createdAt || "");
    return ca.localeCompare(cb);
  });
  return sorted[0];
}

async function runJob(db: Db, jobId: string, params: Record<string, unknown>, estimatedRequests: number) {
  const now = new Date().toISOString();
  await db.collection("scrape_jobs").doc(jobId).update({
    status: "running",
    startedAt: now,
    updatedAt: now,
    progressPercent: 2,
  });
  await appendLog(db, jobId, "▶ Bot iniciou a coleta no Booking...");

  const scriptArgs = buildCliArgs(params);
  let linesSeen = 0;

  await new Promise<void>((resolve, reject) => {
    const child = spawn("tsx", scriptArgs, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const onChunk = async (chunk: Buffer, isErr: boolean) => {
      const text = chunk.toString();
      for (const raw of text.split("\n")) {
        const line = raw.trimEnd();
        if (!line || isNoisyLogLine(line)) continue;
        linesSeen += 1;
        const pct = Math.min(95, 5 + Math.round((linesSeen / Math.max(estimatedRequests * 2, 10)) * 90));
        try {
          await appendLog(db, jobId, isErr ? `⚠ ${line}` : line, { progressPercent: pct });
        } catch (e) {
          console.error("log append failed", e);
        }
      }
    };

    child.stdout.on("data", (c) => {
      void onChunk(c, false);
    });
    child.stderr.on("data", (c) => {
      void onChunk(c, true);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      // Pequena folga para drenar chunks async de log antes do status final
      setTimeout(() => {
        if (code === 0) resolve();
        else reject(new Error(`Scraper exit code ${code}`));
      }, 800);
    });
  });

  const finishedAt = new Date().toISOString();
  await db.collection("scrape_jobs").doc(jobId).update({
    status: "done",
    progressPercent: 100,
    finishedAt,
    updatedAt: finishedAt,
  });
  await appendLog(db, jobId, "✅ Coleta concluída pelo bot.");
  // Garante 100% mesmo se log tardio tentar escrever %
  await db.collection("scrape_jobs").doc(jobId).update({
    progressPercent: 100,
    status: "done",
    updatedAt: new Date().toISOString(),
  });
}

async function tick(db: Db) {
  const doc = await claimNextJob(db);
  if (!doc) return;

  const data = doc.data();
  const jobId = doc.id;
  console.log(`[worker] picking job ${jobId}`);

  try {
    await runJob(db, jobId, data.params || {}, Number(data.estimatedRequests || 10));
    console.log(`[worker] job ${jobId} done`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[worker] job ${jobId} failed:`, msg);
    const finishedAt = new Date().toISOString();
    await db.collection("scrape_jobs").doc(jobId).update({
      status: "error",
      error: msg,
      finishedAt,
      updatedAt: finishedAt,
      progressPercent: 100,
    });
    await appendLog(db, jobId, `✗ Falha: ${msg}`);
  }
}

async function main() {
  const db = initDb();
  console.log("==================================================");
  console.log("🚀 ALLURE SCRAPE JOB WORKER (VPS · Projeto Y)");
  console.log(`   Poll: a cada ${POLL_MS}ms`);
  console.log("==================================================");

  for (;;) {
    try {
      await tick(db);
    } catch (err) {
      console.error("[worker] tick error:", err);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

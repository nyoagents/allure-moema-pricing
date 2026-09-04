/**
 * POST /api/competitors/scrape
 * Queues a scrape job in Firestore for the VPS worker.
 * Returns { jobId } — UI polls GET /api/competitors/scrape-jobs/[id].
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "@/lib/session";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { estimateScrapeWorkload } from "@/lib/scrape-estimate";
import type { ScrapeJob, ScrapeJobParams } from "@/types";

const DEMO_MODE = !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;

  if (DEMO_MODE) {
    return res.status(503).json({
      error: "Firebase não configurado. Configure .env para enfileirar coletas na VPS.",
    });
  }

  const {
    checkin,
    checkout,
    periodStart,
    periodEnd,
    step,
    weekendsOnly,
    hotel,
    hotels,
    adults = "both",
  } = req.body as {
    checkin?: string;
    checkout?: string;
    periodStart?: string;
    periodEnd?: string;
    step?: number;
    weekendsOnly?: boolean;
    hotel?: string;
    hotels?: string[];
    adults?: 1 | 2 | "both";
  };

  const isSingle = !!(checkin && checkout);
  const isPeriod = !!(periodStart && periodEnd);

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

  const hotelIds = [
    ...(hotel ? [hotel] : []),
    ...(Array.isArray(hotels) ? hotels.filter(Boolean) : []),
  ];
  const uniqueHotelIds = [...new Set(hotelIds)];

  const params: ScrapeJobParams = {
    mode: isSingle ? "single" : "period",
    checkin,
    checkout,
    periodStart,
    periodEnd,
    step: step && step > 1 ? Number(step) : 1,
    weekendsOnly: !!weekendsOnly,
    hotelIds: uniqueHotelIds,
    adults: adults === 1 || adults === 2 ? adults : "both",
  };

  const workload = estimateScrapeWorkload(params);
  const now = new Date().toISOString();
  const db = getAdminFirestore();
  const ref = db.collection("scrape_jobs").doc();

  const job: ScrapeJob = {
    id: ref.id,
    status: "pending",
    params,
    ...workload,
    progressPercent: 0,
    logs: [
      "Fila criada — aguardando o bot iniciar...",
      `Tempo estimado de trabalho do bot: ~${workload.estimatedMinutesMin}–${workload.estimatedMinutesMax} min (${workload.estimatedDates} datas × ${workload.estimatedHotels} hotéis).`,
      "Resultados são liberados hotel a hotel conforme a coleta avança.",
    ],
    triggeredBy: adminUser.email || adminUser.uid,
    createdAt: now,
    updatedAt: now,
  };

  await ref.set(job);

  return res.status(202).json({
    jobId: job.id,
    job,
    message: "Coleta enfileirada na VPS",
  });
}

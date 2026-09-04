/**
 * GET /api/competitors — list samples
 * POST /api/competitors — manual sample (admin)
 *
 * History is ordered by run time (scrapedAt / createdAt), not by stay period.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getSessionUser, requireAdmin } from "@/lib/session";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { COMPETITOR_SAMPLES } from "@/data/competitors";
import type { CompetitorSample } from "@/types";

function runTimestamp(s: Pick<CompetitorSample, "scrapedAt" | "createdAt" | "date">): string {
  return s.scrapedAt || s.createdAt || `${s.date}T00:00:00.000Z`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Não autenticado" });

  const DEMO_MODE = !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL;

  if (DEMO_MODE) {
    if (req.method === "GET") return res.status(200).json({ samples: COMPETITOR_SAMPLES });
    return res.status(503).json({ error: "Firebase não configurado (modo demo)" });
  }

  const db = getAdminFirestore();

  if (req.method === "GET") {
    try {
      let firestoreSamples: CompetitorSample[] = [];
      try {
        const snap = await db.collection("competitor_samples").orderBy("createdAt", "desc").limit(150).get();
        firestoreSamples = snap.docs.map((d) => ({
          ...(d.data() as Omit<CompetitorSample, "id">),
          id: d.id,
        }));
      } catch {
        const snap = await db.collection("competitor_samples").limit(200).get();
        firestoreSamples = snap.docs.map((d) => ({
          ...(d.data() as Omit<CompetitorSample, "id">),
          id: d.id,
        }));
      }

      firestoreSamples.sort((a, b) => runTimestamp(b).localeCompare(runTimestamp(a)));

      // Keep static demo rows only when that stay-date has no Firestore sample at all
      const firestoreDates = new Set(firestoreSamples.map((s) => s.date));
      const staticSamples = COMPETITOR_SAMPLES.filter((s) => !firestoreDates.has(s.date));

      const all = [...firestoreSamples, ...staticSamples]
        .sort((a, b) => runTimestamp(b).localeCompare(runTimestamp(a)))
        .slice(0, 100);

      return res.status(200).json({ samples: all });
    } catch {
      return res.status(200).json({ samples: COMPETITOR_SAMPLES });
    }
  }

  if (req.method === "POST") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { date, competitors, notes } = req.body as Partial<CompetitorSample>;
    if (!date || !competitors?.length) {
      return res.status(400).json({ error: "date e competitors são obrigatórios" });
    }

    const newSample: Omit<CompetitorSample, "id"> = {
      date,
      competitors,
      notes: notes ?? "",
      createdAt: new Date().toISOString(),
    };

    const ref = await db.collection("competitor_samples").add(newSample);
    return res.status(201).json({ sample: { ...newSample, id: ref.id } });
  }

  return res.status(405).end();
}

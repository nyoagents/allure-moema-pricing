/**
 * GET /api/competitors/scrape-jobs/[id]
 * Poll scrape job status (synced with VPS worker via Firestore).
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getSessionUser } from "@/lib/session";
import { getAdminFirestore } from "@/lib/firebase-admin";
import type { ScrapeJob } from "@/types";

const DEMO_MODE = !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Não autenticado" });

  if (DEMO_MODE) {
    return res.status(503).json({ error: "Firebase não configurado" });
  }

  const id = String(req.query.id || "");
  if (!id) return res.status(400).json({ error: "id obrigatório" });

  const db = getAdminFirestore();
  const snap = await db.collection("scrape_jobs").doc(id).get();
  if (!snap.exists) return res.status(404).json({ error: "Job não encontrado" });

  const job = { id: snap.id, ...(snap.data() as Omit<ScrapeJob, "id">) };
  return res.status(200).json({ job });
}

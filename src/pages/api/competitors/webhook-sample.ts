import type { NextApiRequest, NextApiResponse } from "next";
import { getAdminFirestore } from "@/lib/firebase-admin";
import type { CompetitorSample } from "@/types";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const secret = req.headers["x-webhook-secret"] || req.query.secret;
  const expectedSecret = process.env.SCRAPER_WEBHOOK_SECRET || "allure-scraper-vps-2026";

  if (secret !== expectedSecret) {
    return res.status(401).json({ error: "Unauthorized webhook access" });
  }

  const { sample, samples }: { sample?: CompetitorSample; samples?: CompetitorSample[] } = req.body;
  const itemsToSave = samples ?? (sample ? [sample] : []);

  if (itemsToSave.length === 0) {
    return res.status(400).json({ error: "Nenhuma amostra fornecida" });
  }

  const DEMO_MODE = !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL;

  if (DEMO_MODE) {
    return res.status(200).json({ savedCount: itemsToSave.length, mode: "demo" });
  }

  try {
    const db = getAdminFirestore();
    const batch = db.batch();

    for (const item of itemsToSave) {
      const id = item.id || `sample-${item.date}-${Date.now()}`;
      const docRef = db.collection("competitor_samples").doc(id);
      batch.set(docRef, { ...item, id, updatedAt: new Date().toISOString() }, { merge: true });
    }

    await batch.commit();

    return res.status(200).json({ success: true, savedCount: itemsToSave.length });
  } catch (err: any) {
    console.error("Failed to save webhook samples:", err);
    return res.status(500).json({ error: err.message || "Erro ao salvar amostras do webhook" });
  }
}

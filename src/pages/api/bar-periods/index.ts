import type { NextApiRequest, NextApiResponse } from "next";
import { getSessionUser, requireAdmin } from "@/lib/session";
import { getAdminFirestore } from "@/lib/firebase-admin";
import type { BarPeriod } from "@/types";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Não autenticado" });

  const DEMO_MODE = !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL;

  if (DEMO_MODE) {
    if (req.method === "GET") return res.status(200).json({ periods: [] });
    return res.status(503).json({ error: "Firebase não configurado (modo demo)" });
  }

  const db = getAdminFirestore();

  if (req.method === "GET") {
    const snap = await db.collection("bar_periods").orderBy("startDate").get();
    const periods: BarPeriod[] = snap.docs.map((d) => ({
      ...(d.data() as Omit<BarPeriod, "id">),
      id: d.id,
    }));
    return res.status(200).json({ periods });
  }

  if (req.method === "POST") {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { startDate, endDate, barLevel, season, notes } = req.body as Partial<BarPeriod>;

    if (!startDate || !endDate || barLevel === undefined || !season) {
      return res.status(400).json({ error: "Campos obrigatórios: startDate, endDate, barLevel, season" });
    }

    if (startDate > endDate) {
      return res.status(400).json({ error: "Data início deve ser anterior à data fim" });
    }

    const newPeriod: Omit<BarPeriod, "id"> = {
      startDate,
      endDate,
      barLevel: Number(barLevel),
      season,
      notes: notes ?? "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const ref = await db.collection("bar_periods").add(newPeriod);
    return res.status(201).json({ period: { ...newPeriod, id: ref.id } });
  }

  return res.status(405).end();
}

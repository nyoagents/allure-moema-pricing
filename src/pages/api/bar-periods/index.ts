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
    const periods: BarPeriod[] = snap.docs.map((d) => {
      const data = d.data() as Omit<BarPeriod, "id">;
      const periodId = d.id;
      let { startDate, endDate, barLevel, season, notes, isManual, createdAt, updatedAt } = data;

      // Anti-distortion guardrail: auto-heal old event periods with excessive durations
      if (periodId.startsWith("period-event-") || notes?.startsWith("Evento:")) {
        const start = new Date(startDate).getTime();
        const end = new Date(endDate).getTime();
        const diffDays = Math.round((end - start) / (1000 * 60 * 60 * 24));

        if (diffDays > 5 && barLevel <= 3) {
          const capEnd = new Date(start + 4 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          endDate = capEnd;
          barLevel = Math.max(barLevel, 4);
          db.collection("bar_periods").doc(periodId).set({ endDate: capEnd, barLevel, updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
        }
      }

      return {
        id: periodId,
        startDate,
        endDate,
        barLevel,
        season,
        notes,
        isManual,
        createdAt,
        updatedAt,
      };
    });
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
      isManual: true, // Explicit user override created via calendar / admin
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const ref = await db.collection("bar_periods").add(newPeriod);
    return res.status(201).json({ period: { ...newPeriod, id: ref.id } });
  }

  return res.status(405).end();
}

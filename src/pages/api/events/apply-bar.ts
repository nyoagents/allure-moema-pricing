import type { NextApiRequest, NextApiResponse } from "next";
import { getSessionUser, requireAdmin } from "@/lib/session";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { barToSeason } from "@/lib/pricing-engine";
import type { BarPeriod, EventItem } from "@/types";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Não autenticado" });

  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;

  const { event }: { event: EventItem } = req.body;
  if (!event || !event.startDate || !event.endDate || !event.recommendedBar) {
    return res.status(400).json({ error: "Dados do evento incompletos" });
  }

  const periodId = `period-event-${event.id}`;
  const newPeriod: BarPeriod = {
    id: periodId,
    startDate: event.startDate,
    endDate: event.endDate,
    barLevel: event.recommendedBar,
    season: barToSeason(event.recommendedBar),
    notes: `Evento: ${event.title} (${event.location || event.venue})`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const DEMO_MODE = !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL;

  if (DEMO_MODE) {
    return res.status(201).json({ period: newPeriod, message: "BAR do evento aplicado com sucesso (Modo Demo)" });
  }

  try {
    const db = getAdminFirestore();
    await db.collection("bar_periods").doc(periodId).set(newPeriod, { merge: true });
    return res.status(201).json({ period: newPeriod, message: "BAR do evento aplicado com sucesso ao Calendário" });
  } catch (err) {
    console.error("Failed to apply event BAR period:", err);
    return res.status(500).json({ error: "Erro ao criar período BAR no banco" });
  }
}

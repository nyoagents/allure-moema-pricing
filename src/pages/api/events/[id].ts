import type { NextApiRequest, NextApiResponse } from "next";
import { getSessionUser, requireAdmin } from "@/lib/session";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { barToSeason } from "@/lib/pricing-engine";
import { addDays } from "@/lib/utils";
import type { EventItem, BarPeriod } from "@/types";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Não autenticado" });

  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;

  const { id } = req.query;
  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "ID inválido" });
  }

  const DEMO_MODE = !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL;
  const periodId = `period-event-${id}`;

  if (req.method === "DELETE") {
    if (DEMO_MODE) {
      return res.status(200).json({ ok: true });
    }

    try {
      const db = getAdminFirestore();
      const batch = db.batch();
      batch.delete(db.collection("events").doc(id));
      batch.delete(db.collection("bar_periods").doc(periodId));
      await batch.commit();

      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("Failed to delete event:", err);
      return res.status(500).json({ error: "Erro ao excluir evento" });
    }
  }

  if (req.method === "PUT") {
    const updatedData: Partial<EventItem> = req.body;

    if (DEMO_MODE) {
      return res.status(200).json({ event: updatedData });
    }

    try {
      const db = getAdminFirestore();
      const eventDoc = await db.collection("events").doc(id).get();
      const currentEvent = eventDoc.exists ? (eventDoc.data() as EventItem) : null;
      const merged: EventItem = { ...(currentEvent ?? ({} as any)), ...updatedData, id };

      const batch = db.batch();
      batch.set(db.collection("events").doc(id), merged, { merge: true });

      // If enabled, ensure corresponding bar_periods doc is created/updated
      if (merged.enabled !== false) {
        const leadIn = merged.leadInDays ?? 1;
        const effectiveStart = merged.effectiveStartDate || (merged.startDate ? addDays(merged.startDate, -leadIn) : merged.startDate);

        const barPeriod: BarPeriod = {
          id: periodId,
          startDate: effectiveStart,
          endDate: merged.endDate,
          barLevel: merged.recommendedBar,
          season: barToSeason(merged.recommendedBar),
          notes: `Evento: ${merged.title} (${merged.location || merged.venue || "SP"})`,
          createdAt: merged.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        batch.set(db.collection("bar_periods").doc(periodId), barPeriod, { merge: true });
      } else {
        // If disabled by user, delete corresponding bar period so calendar returns to baseline
        batch.delete(db.collection("bar_periods").doc(periodId));
      }

      await batch.commit();
      return res.status(200).json({ event: merged });
    } catch (err) {
      console.error("Failed to update event:", err);
      return res.status(500).json({ error: "Erro ao atualizar evento" });
    }
  }

  return res.status(405).end();
}

import type { NextApiRequest, NextApiResponse } from "next";
import { getSessionUser, requireAdmin } from "@/lib/session";
import { scanEventsWithClaude } from "@/lib/claude-events";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { barToSeason } from "@/lib/pricing-engine";
import { addDays } from "@/lib/utils";
import type { BarPeriod } from "@/types";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Não autenticado" });

  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;

  const { startDate, endDate, autoSave = true } = req.body;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: "startDate e endDate são obrigatórios" });
  }

  try {
    const scanned = await scanEventsWithClaude({ startDate, endDate });

    const DEMO_MODE = !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL;

    if (!DEMO_MODE && autoSave && scanned.length > 0) {
      const db = getAdminFirestore();
      const batch = db.batch();

      for (const event of scanned) {
        // 1. Save event
        const eventRef = db.collection("events").doc(event.id);
        batch.set(eventRef, event, { merge: true });

        // 2. Automatically apply BAR period (including pre-event lead-in D-1)
        if (event.enabled !== false) {
          const effectiveStart = event.effectiveStartDate || addDays(event.startDate, -(event.leadInDays ?? 1));
          const periodId = `period-event-${event.id}`;
          const periodRef = db.collection("bar_periods").doc(periodId);
          const barPeriod: BarPeriod = {
            id: periodId,
            startDate: effectiveStart,
            endDate: event.endDate,
            barLevel: event.recommendedBar,
            season: barToSeason(event.recommendedBar),
            notes: `Evento: ${event.title} (${event.location || event.venue || "SP"})`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          batch.set(periodRef, barPeriod, { merge: true });
        }
      }

      await batch.commit();
    }

    return res.status(200).json({ events: scanned, count: scanned.length });
  } catch (err) {
    console.error("Error scanning events:", err);
    return res.status(500).json({ error: "Falha ao escanear eventos" });
  }
}

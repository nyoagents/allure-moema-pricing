import type { NextApiRequest, NextApiResponse } from "next";
import { getSessionUser, requireAdmin } from "@/lib/session";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { CURATED_SP_EVENTS, sanitizeEventItem } from "@/lib/claude-events";
import { barToSeason } from "@/lib/pricing-engine";
import { addDays } from "@/lib/utils";
import type { EventItem, BarPeriod } from "@/types";

let inMemoryEvents: EventItem[] = [...CURATED_SP_EVENTS];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Não autenticado" });

  const DEMO_MODE = !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL;

  if (req.method === "GET") {
    if (DEMO_MODE) {
      return res.status(200).json({ events: inMemoryEvents });
    }

    try {
      const db = getAdminFirestore();
      const snap = await db.collection("events").orderBy("startDate", "asc").get();

      if (snap.empty) {
        // Seed curated events and their automatic bar periods
        const batch = db.batch();
        for (const ev of CURATED_SP_EVENTS) {
          batch.set(db.collection("events").doc(ev.id), ev);
          if (ev.enabled !== false) {
            const effectiveStart = ev.effectiveStartDate || addDays(ev.startDate, -(ev.leadInDays ?? 1));
            const periodId = `period-event-${ev.id}`;
            const barPeriod: BarPeriod = {
              id: periodId,
              startDate: effectiveStart,
              endDate: ev.endDate,
              barLevel: ev.recommendedBar,
              season: barToSeason(ev.recommendedBar),
              notes: `Evento: ${ev.title} (${ev.location || ev.venue || "SP"})`,
              createdAt: ev.createdAt || new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            batch.set(db.collection("bar_periods").doc(periodId), barPeriod, { merge: true });
          }
        }
        await batch.commit();
        return res.status(200).json({ events: CURATED_SP_EVENTS });
      }

      const events = snap.docs.map((d) => {
        const data = d.data() as EventItem;
        const sanitized = sanitizeEventItem({
          ...data,
          id: d.id,
        });

        // Auto-heal Firestore if old document had un-sanitized dates or durations
        if (data.endDate !== sanitized.endDate || data.recommendedBar !== sanitized.recommendedBar) {
          db.collection("events").doc(d.id).set(sanitized, { merge: true }).catch(() => {});
          const periodId = `period-event-${d.id}`;
          const barPeriod: BarPeriod = {
            id: periodId,
            startDate: sanitized.effectiveStartDate || addDays(sanitized.startDate, -(sanitized.leadInDays ?? 1)),
            endDate: sanitized.endDate,
            barLevel: sanitized.recommendedBar,
            season: barToSeason(sanitized.recommendedBar),
            notes: `Evento: ${sanitized.title} (${sanitized.location || sanitized.venue || "SP"})`,
            createdAt: sanitized.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          db.collection("bar_periods").doc(periodId).set(barPeriod, { merge: true }).catch(() => {});
        }

        return sanitized;
      });
      return res.status(200).json({ events });
    } catch (err) {
      console.warn("Firestore error on events GET, fallback to curated:", err);
      return res.status(200).json({ events: inMemoryEvents });
    }
  }

  if (req.method === "POST") {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;

    const event = sanitizeEventItem({
      ...req.body,
      id: req.body.id || `event-${Date.now()}`,
      enabled: req.body.enabled !== false,
      createdAt: new Date().toISOString(),
    });

    if (DEMO_MODE) {
      inMemoryEvents.push(event);
      return res.status(201).json({ event });
    }

    try {
      const db = getAdminFirestore();
      const batch = db.batch();

      batch.set(db.collection("events").doc(event.id), event, { merge: true });

      // Automatically sync BAR period
      const periodId = `period-event-${event.id}`;
      if (event.enabled) {
        const barPeriod: BarPeriod = {
          id: periodId,
          startDate: event.effectiveStartDate || addDays(event.startDate, -(event.leadInDays ?? 1)),
          endDate: event.endDate,
          barLevel: event.recommendedBar,
          season: barToSeason(event.recommendedBar),
          notes: `Evento: ${event.title} (${event.location || event.venue || "SP"})`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        batch.set(db.collection("bar_periods").doc(periodId), barPeriod, { merge: true });
      } else {
        batch.delete(db.collection("bar_periods").doc(periodId));
      }

      await batch.commit();
      return res.status(201).json({ event });
    } catch (err) {
      console.error("Failed to save event:", err);
      return res.status(500).json({ error: "Erro ao salvar evento" });
    }
  }

  return res.status(405).end();
}

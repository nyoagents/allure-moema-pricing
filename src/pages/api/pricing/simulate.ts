import type { NextApiRequest, NextApiResponse } from "next";
import { getSessionUser } from "@/lib/session";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getPriceForDate } from "@/lib/pricing-engine";
import type { BarPeriod } from "@/types";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Não autenticado" });

  const { roomId, checkin, checkout, pax, breakfast } = req.query;

  if (!roomId || !checkin || !checkout) {
    return res.status(400).json({ error: "roomId, checkin e checkout são obrigatórios" });
  }

  const paxNum = parseInt(String(pax ?? "1"), 10) as 1 | 2;
  const withBreakfast = breakfast === "true";

  // Build date range (checkin inclusive, checkout exclusive)
  const days: string[] = [];
  let cur = String(checkin);
  while (cur < String(checkout)) {
    days.push(cur);
    const d = new Date(cur + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    cur = d.toISOString().slice(0, 10);
  }

  if (days.length === 0) return res.status(400).json({ error: "Período inválido" });
  if (days.length > 90) return res.status(400).json({ error: "Período máximo: 90 noites" });

  // Load bar_periods
  const DEMO_MODE = !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL;
  let barPeriods: BarPeriod[] = [];
  if (!DEMO_MODE) {
    const db = getAdminFirestore();
    const snap = await db.collection("bar_periods").orderBy("startDate").get();
    barPeriods = snap.docs.map((d) => ({ ...(d.data() as Omit<BarPeriod, "id">), id: d.id }));
  }

  const breakdown = days.map((date) => {
    const { price, barLevel, barSource, season } = getPriceForDate(
      String(roomId),
      date,
      { pax: paxNum, breakfast: withBreakfast },
      barPeriods,
    );
    return { date, barLevel, barSource, season, price };
  });

  const total = breakdown.reduce((s, d) => s + d.price, 0);

  return res.status(200).json({ breakdown, total, nights: days.length });
}

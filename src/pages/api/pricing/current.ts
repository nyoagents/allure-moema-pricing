import type { NextApiRequest, NextApiResponse } from "next";
import { getSessionUser } from "@/lib/session";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getPricingForAllRooms, getMonthCalendarData } from "@/lib/pricing-engine";
import type { BarPeriod } from "@/types";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Não autenticado" });

  const { date, year, month } = req.query;

  const DEMO_MODE = !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL;

  try {
    let barPeriods: BarPeriod[] = [];

    if (!DEMO_MODE) {
      const db = getAdminFirestore();
      const periodsSnap = await db.collection("bar_periods").orderBy("startDate").get();
      barPeriods = periodsSnap.docs.map((d) => ({
        ...(d.data() as Omit<BarPeriod, "id">),
        id: d.id,
      }));
    }

    if (year && month) {
      // Calendar month view
      const y = parseInt(String(year), 10);
      const m = parseInt(String(month), 10);
      const calData = getMonthCalendarData(y, m, barPeriods);
      return res.status(200).json({ calendar: calData, barPeriods });
    }

    // Dashboard: pricing for today or a specific date
    const targetDate = typeof date === "string" ? date : new Date().toISOString().split("T")[0];
    const pricing = getPricingForAllRooms(targetDate, {}, barPeriods);

    return res.status(200).json({ date: targetDate, pricing, barPeriods });
  } catch (err) {
    console.error("pricing/current error:", err);
    return res.status(500).json({ error: "Erro ao calcular preços" });
  }
}

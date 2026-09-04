import type { NextApiRequest, NextApiResponse } from "next";
import { getSessionUser } from "@/lib/session";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getDesbravadorComparison } from "@/lib/desbravador";
import { todayISO } from "@/lib/utils";
import type { BarPeriod } from "@/types";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Não autenticado" });

  const date = (req.query.date as string) || todayISO();
  const pax = req.query.pax === "2" ? 2 : 1;
  const breakfast = req.query.breakfast === "true";

  const DEMO_MODE = !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL;

  let barPeriods: BarPeriod[] = [];

  if (!DEMO_MODE) {
    try {
      const db = getAdminFirestore();
      const snap = await db.collection("bar_periods").get();
      barPeriods = snap.docs.map((d) => ({ id: d.id, ...d.data() } as BarPeriod));
    } catch (err) {
      console.warn("Could not load bar_periods from Firestore:", err);
    }
  }

  const comparison = getDesbravadorComparison({
    dateISO: date,
    pax,
    breakfast,
    barPeriods,
  });

  return res.status(200).json({
    date,
    pax,
    breakfast,
    comparison,
  });
}

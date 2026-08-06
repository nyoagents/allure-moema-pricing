import type { NextApiRequest, NextApiResponse } from "next";
import { requireAdmin } from "@/lib/session";
import { getAdminFirestore } from "@/lib/firebase-admin";
import type { BarPeriod } from "@/types";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { id } = req.query as { id: string };
  const db = getAdminFirestore();
  const ref = db.collection("bar_periods").doc(id);

  if (req.method === "PUT") {
    const { startDate, endDate, barLevel, season, notes } = req.body as Partial<BarPeriod>;
    if (!startDate || !endDate || barLevel === undefined || !season) {
      return res.status(400).json({ error: "Campos obrigatórios faltando" });
    }
    const update = {
      startDate,
      endDate,
      barLevel: Number(barLevel),
      season,
      notes: notes ?? "",
      updatedAt: new Date().toISOString(),
    };
    await ref.update(update);
    const snap = await ref.get();
    return res.status(200).json({ period: { ...snap.data(), id: snap.id } });
  }

  if (req.method === "DELETE") {
    await ref.delete();
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}

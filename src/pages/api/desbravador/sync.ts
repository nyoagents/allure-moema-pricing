import type { NextApiRequest, NextApiResponse } from "next";
import { getSessionUser, requireAdmin } from "@/lib/session";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { syncFullHorizonDesbravador } from "@/lib/desbravador";
import type { BarPeriod, DesbravadorSyncLog } from "@/types";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Não autenticado" });

  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;

  const { horizonDays = 30, useProduction = true } = req.body;

  const DEMO_MODE = !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL;

  try {
    let barPeriods: BarPeriod[] = [];

    if (!DEMO_MODE) {
      const db = getAdminFirestore();
      const periodsSnap = await db.collection("bar_periods").get();
      barPeriods = periodsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as BarPeriod));
    }

    const logs = await syncFullHorizonDesbravador({
      horizonDays: Number(horizonDays),
      barPeriods,
      triggeredBy: user.email,
      useProduction,
    });

    if (!DEMO_MODE) {
      const db = getAdminFirestore();
      const batch = db.batch();

      for (const log of logs) {
        const ref = db.collection("integration_logs").doc(log.id);
        batch.set(ref, log);
      }

      // Update settings with last sync status
      const lastStatus = logs.every((l) => l.status === "success") ? "success" : "error";
      const settingsRef = db.collection("settings").doc("integration");
      batch.set(
        settingsRef,
        {
          lastSyncAt: new Date().toISOString(),
          lastSyncStatus: lastStatus,
          lastSyncMessage: `Sincronização manual (${horizonDays} dias) executada por ${user.email}`,
        },
        { merge: true }
      );

      await batch.commit();
    }

    return res.status(200).json({ logs, count: logs.length, success: logs.every((l) => l.status === "success") });
  } catch (err: any) {
    console.error("Failed to execute Desbravador sync:", err);
    return res.status(500).json({ error: err.message || "Erro durante sincronização com Desbravador" });
  }
}

import type { NextApiRequest, NextApiResponse } from "next";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { syncFullHorizonDesbravador } from "@/lib/desbravador";
import type { BarPeriod, IntegrationSettings } from "@/types";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Protect cron endpoint with Bearer token or secret query parameter
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET || "allure-pricing-cron-2026";

  const token = authHeader ? authHeader.replace(/^Bearer\s+/i, "") : req.query.secret;

  if (token !== cronSecret) {
    return res.status(401).json({ error: "Acesso não autorizado ao cron" });
  }

  const DEMO_MODE = !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL;

  try {
    let settings: IntegrationSettings = {
      desbravadorAutoSync: true,
      desbravadorCompanyId: 6181,
      desbravadorChannelId: 4484,
      syncHorizonDays: 30,
    };

    let barPeriods: BarPeriod[] = [];

    if (!DEMO_MODE) {
      const db = getAdminFirestore();
      const settingsDoc = await db.collection("settings").doc("integration").get();
      if (settingsDoc.exists) {
        settings = settingsDoc.data() as IntegrationSettings;
      }

      if (!settings.desbravadorAutoSync) {
        return res.status(200).json({
          status: "skipped",
          message: "Distribuição automática para o Desbravador está desativada nas configurações.",
        });
      }

      const periodsSnap = await db.collection("bar_periods").get();
      barPeriods = periodsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as BarPeriod));
    }

    const logs = await syncFullHorizonDesbravador({
      horizonDays: settings.syncHorizonDays || 30,
      barPeriods,
      triggeredBy: "cron-job",
      useProduction: true,
    });

    if (!DEMO_MODE) {
      const db = getAdminFirestore();
      const batch = db.batch();

      for (const log of logs) {
        const ref = db.collection("integration_logs").doc(log.id);
        batch.set(ref, log);
      }

      const lastStatus = logs.every((l) => l.status === "success") ? "success" : "error";
      const settingsRef = db.collection("settings").doc("integration");
      batch.set(
        settingsRef,
        {
          lastSyncAt: new Date().toISOString(),
          lastSyncStatus: lastStatus,
          lastSyncMessage: `Cron diário executado com sucesso (${settings.syncHorizonDays || 30} dias)`,
        },
        { merge: true }
      );

      await batch.commit();
    }

    return res.status(200).json({
      status: "success",
      logsCount: logs.length,
      logs,
    });
  } catch (err: any) {
    console.error("Cron sync error:", err);
    return res.status(500).json({ error: err.message || "Erro no cron de sincronização" });
  }
}

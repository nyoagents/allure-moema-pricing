import type { NextApiRequest, NextApiResponse } from "next";
import { getSessionUser, requireAdmin } from "@/lib/session";
import { getAdminFirestore } from "@/lib/firebase-admin";
import type { IntegrationSettings, DesbravadorSyncLog } from "@/types";

let inMemorySettings: IntegrationSettings = {
  desbravadorAutoSync: false, // Starts disabled by default until VPS is activated
  desbravadorCompanyId: 6181,
  desbravadorChannelId: 4484,
  syncHorizonDays: 30,
  lastSyncAt: undefined,
  lastSyncStatus: undefined,
  lastSyncMessage: "Distribuição automática desativada",
};

let inMemoryLogs: DesbravadorSyncLog[] = [
  {
    id: "log-init-1",
    timestamp: new Date().toISOString(),
    startDate: "2026-08-28",
    endDate: "2026-09-28",
    rateCompanyId: 15270,
    rateCompanyName: "Com Café da Manhã",
    ratesCount: 12,
    status: "success",
    responseCode: 200,
    message: "Conexão com a API Desbravador testada e validada (Company 6181 / Channel 4484).",
    durationMs: 340,
    triggeredBy: "sistema",
  },
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Não autenticado" });

  const DEMO_MODE = !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL;

  if (req.method === "GET") {
    if (DEMO_MODE) {
      return res.status(200).json({
        settings: inMemorySettings,
        logs: inMemoryLogs,
      });
    }

    try {
      const db = getAdminFirestore();
      const settingsDoc = await db.collection("settings").doc("integration").get();
      const settings: IntegrationSettings = settingsDoc.exists
        ? ({ ...inMemorySettings, ...(settingsDoc.data() as IntegrationSettings) })
        : inMemorySettings;

      const logsSnap = await db
        .collection("integration_logs")
        .orderBy("timestamp", "desc")
        .limit(50)
        .get();

      const logs = logsSnap.empty
        ? inMemoryLogs
        : logsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      return res.status(200).json({ settings, logs });
    } catch (err) {
      console.warn("Firestore error on desbravador status GET:", err);
      return res.status(200).json({
        settings: inMemorySettings,
        logs: inMemoryLogs,
      });
    }
  }

  if (req.method === "POST") {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;

    const newSettings: Partial<IntegrationSettings> = req.body;

    if (DEMO_MODE) {
      inMemorySettings = { ...inMemorySettings, ...newSettings };
      return res.status(200).json({ settings: inMemorySettings });
    }

    try {
      const db = getAdminFirestore();
      await db.collection("settings").doc("integration").set(newSettings, { merge: true });
      return res.status(200).json({ settings: { ...inMemorySettings, ...newSettings } });
    } catch (err) {
      console.error("Failed to update integration settings:", err);
      return res.status(500).json({ error: "Erro ao salvar configurações de integração" });
    }
  }

  return res.status(405).end();
}

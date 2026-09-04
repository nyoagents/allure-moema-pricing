import type { NextApiRequest, NextApiResponse } from "next";
import { getSessionUser, requireAdmin } from "@/lib/session";
import { getAdminFirestore } from "@/lib/firebase-admin";
import {
  buildDesbravadorPayload,
  sendRatesToDesbravador,
  DESBRAVADOR_PLANS,
} from "@/lib/desbravador";
import type { BarPeriod, DesbravadorSyncLog, RoomId } from "@/types";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Não autenticado" });

  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;

  const {
    startDate,
    endDate,
    planId = DESBRAVADOR_PLANS.WITHOUT_BREAKFAST.id,
    offsetCents = 1, // Default +1 centavo
    roomId,
    useProduction = true,
    customUser,
    customPass,
    companyId,
  } = req.body;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: "startDate e endDate são obrigatórios" });
  }

  const DEMO_MODE = !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL;

  try {
    let barPeriods: BarPeriod[] = [];
    if (!DEMO_MODE) {
      const db = getAdminFirestore();
      const periodsSnap = await db.collection("bar_periods").get();
      barPeriods = periodsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as BarPeriod));
    }

    const payload = buildDesbravadorPayload({
      startDate,
      endDate,
      planId: Number(planId),
      barPeriods,
      offsetCents: Number(offsetCents),
      specificRoomId: roomId as RoomId | undefined,
      customUser,
      customPass,
      companyId: companyId ? Number(companyId) : undefined,
    });

    const result = await sendRatesToDesbravador(payload, useProduction);

    const log: DesbravadorSyncLog = {
      id: `test-rate-${Date.now()}`,
      timestamp: new Date().toISOString(),
      startDate,
      endDate,
      rateCompanyId: Number(planId),
      rateCompanyName:
        Number(planId) === DESBRAVADOR_PLANS.WITH_BREAKFAST.id
          ? DESBRAVADOR_PLANS.WITH_BREAKFAST.name
          : DESBRAVADOR_PLANS.WITHOUT_BREAKFAST.name,
      ratesCount: payload.prices.length,
      status: result.success ? "success" : "error",
      responseCode: result.statusCode,
      message: result.success
        ? `[TESTE OFFSET ${offsetCents > 0 ? `+${offsetCents}¢` : `${offsetCents}¢`}] Enviado com sucesso.`
        : `Erro na resposta da API Desbravador: ${JSON.stringify(result.data)}`,
      durationMs: result.durationMs,
      triggeredBy: user.email,
      isTestOffset: true,
      offsetAmount: offsetCents / 100,
    };

    if (!DEMO_MODE) {
      const db = getAdminFirestore();
      await db.collection("integration_logs").doc(log.id).set(log);
    }

    return res.status(200).json({
      success: result.success,
      statusCode: result.statusCode,
      durationMs: result.durationMs,
      payloadSent: payload,
      rawResponse: result.data,
      log,
    });
  } catch (err: any) {
    console.error("Test rate error:", err);
    return res.status(500).json({ error: err.message || "Erro no teste de API Desbravador" });
  }
}

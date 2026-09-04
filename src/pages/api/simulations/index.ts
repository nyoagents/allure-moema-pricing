import type { NextApiRequest, NextApiResponse } from "next";
import { getSessionUser } from "@/lib/session";
import { getAdminFirestore } from "@/lib/firebase-admin";
import type { SimulationRecord } from "@/types";

// In-memory store for demo fallback
let inMemorySimulations: SimulationRecord[] = [];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Não autenticado" });

  const DEMO_MODE = !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL;

  if (req.method === "GET") {
    if (DEMO_MODE) {
      return res.status(200).json({ simulations: inMemorySimulations });
    }

    try {
      const db = getAdminFirestore();
      const snap = await db
        .collection("simulations")
        .orderBy("createdAt", "desc")
        .limit(100)
        .get();

      const simulations = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return res.status(200).json({ simulations });
    } catch (err) {
      console.warn("Firestore error on simulations GET, fallback to memory:", err);
      return res.status(200).json({ simulations: inMemorySimulations });
    }
  }

  if (req.method === "POST") {
    const simulation: SimulationRecord = {
      ...req.body,
      id: req.body.id || `sim-${Date.now()}`,
      createdAt: new Date().toISOString(),
      userEmail: user.email,
    };

    if (DEMO_MODE) {
      inMemorySimulations.unshift(simulation);
      return res.status(201).json({ simulation });
    }

    try {
      const db = getAdminFirestore();
      await db.collection("simulations").doc(simulation.id).set(simulation);
      return res.status(201).json({ simulation });
    } catch (err) {
      console.error("Failed to save simulation:", err);
      return res.status(500).json({ error: "Erro ao salvar simulação" });
    }
  }

  return res.status(405).end();
}

import type { NextApiRequest, NextApiResponse } from "next";
import { getSessionUser } from "@/lib/session";
import { getAdminFirestore } from "@/lib/firebase-admin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Não autenticado" });

  const { id } = req.query;
  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "ID inválido" });
  }

  const DEMO_MODE = !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL;

  if (req.method === "DELETE") {
    if (DEMO_MODE) {
      return res.status(200).json({ ok: true });
    }

    try {
      const db = getAdminFirestore();
      await db.collection("simulations").doc(id).delete();
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("Failed to delete simulation:", err);
      return res.status(500).json({ error: "Erro ao excluir simulação" });
    }
  }

  return res.status(405).end();
}

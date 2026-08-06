import type { NextApiRequest, NextApiResponse } from "next";
import { getSessionUser, getSessionToken, decryptSession } from "@/lib/session";

const DEMO_MODE = !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  // Demo mode: resolve sessão localmente sem Firestore
  if (DEMO_MODE) {
    const token = getSessionToken(req);
    if (!token) return res.status(401).json({ error: "Não autenticado" });
    const payload = decryptSession(token);
    if (!payload?.uid) return res.status(401).json({ error: "Sessão inválida" });
    return res.status(200).json({
      user: { uid: payload.uid, email: payload.email ?? "", role: "admin" },
      demo: true,
    });
  }

  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: "Não autenticado" });
  return res.status(200).json({ user });
}

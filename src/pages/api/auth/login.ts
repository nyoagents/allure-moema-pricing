import type { NextApiRequest, NextApiResponse } from "next";
import {
  loginWithPassword,
  verifyIdToken,
  ensureUserDoc,
  encryptSession,
  setSessionCookie,
} from "@/lib/session";

const DEMO_MODE = !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    return res.status(400).json({ error: "Email e senha são obrigatórios" });
  }

  // Demo mode: Firebase não configurado — aceita qualquer credencial
  if (DEMO_MODE) {
    const sessionToken = encryptSession({ uid: "demo-user", email });
    setSessionCookie(res, sessionToken);
    return res.status(200).json({
      user: { uid: "demo-user", email, role: "admin" },
      demo: true,
    });
  }

  try {
    const idToken = await loginWithPassword(email, password);
    const { uid, email: verifiedEmail } = await verifyIdToken(idToken);
    const user = await ensureUserDoc(uid, verifiedEmail);
    const sessionToken = encryptSession({ uid, email: verifiedEmail });
    setSessionCookie(res, sessionToken);
    return res.status(200).json({ user: { uid: user.uid, email: user.email, role: user.role } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro ao autenticar";
    const friendly =
      message.includes("INVALID_LOGIN_CREDENTIALS") ||
      message.includes("INVALID_PASSWORD") ||
      message.includes("EMAIL_NOT_FOUND")
        ? "Email ou senha incorretos"
        : message;
    return res.status(401).json({ error: friendly });
  }
}

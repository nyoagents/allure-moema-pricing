import type { NextApiRequest, NextApiResponse } from "next";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { getAdminAuth, getAdminFirestore } from "./firebase-admin";
import type { User } from "@/types";

const COOKIE_NAME = "allure_session";
const ALGO = "aes-256-gcm";

const DEMO_SECRET = "allure-demo-key-fallback-32chars";

function getKey(): Buffer {
  const secret = process.env.SESSION_SECRET ?? "";
  const effective = secret.length >= 16 ? secret : DEMO_SECRET;
  const key = Buffer.alloc(32);
  Buffer.from(effective).copy(key);
  return key;
}

export function encryptSession(payload: object): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const json = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(".");
}

export function decryptSession(token: string): Record<string, unknown> | null {
  try {
    const key = getKey();
    const [ivHex, tagHex, encHex] = token.split(".");
    if (!ivHex || !tagHex || !encHex) return null;
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const encrypted = Buffer.from(encHex, "hex");
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const json = decipher.update(encrypted, undefined, "utf8") + decipher.final("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function setSessionCookie(res: NextApiResponse, token: string) {
  const maxAge = 60 * 60 * 24 * 7; // 7 days
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Strict${
      process.env.NODE_ENV === "production" ? "; Secure" : ""
    }`
  );
}

export function clearSessionCookie(res: NextApiResponse) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict`
  );
}

export function getSessionToken(req: NextApiRequest): string | null {
  const cookie = req.headers.cookie ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  return match?.[1] ?? null;
}

export async function getSessionUser(req: NextApiRequest): Promise<User | null> {
  const token = getSessionToken(req);
  if (!token) return null;

  const payload = decryptSession(token);
  if (!payload?.uid || typeof payload.uid !== "string") return null;

  // Demo mode: Firebase not configured — resolve user from cookie payload directly
  const DEMO_MODE = !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL;
  if (DEMO_MODE) {
    return {
      uid: payload.uid as string,
      email: (payload.email as string) ?? "",
      role: "admin",
    };
  }

  try {
    const db = getAdminFirestore();
    const snap = await db.collection("users").doc(payload.uid).get();
    if (!snap.exists) return null;
    const data = snap.data() as User;
    return { ...data, uid: snap.id };
  } catch {
    return null;
  }
}

export async function requireAdmin(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<User | null> {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Não autenticado" });
    return null;
  }
  if (user.role !== "admin") {
    res.status(403).json({ error: "Acesso restrito a administradores" });
    return null;
  }
  return user;
}

export async function loginWithPassword(email: string, password: string): Promise<string> {
  const apiKey = process.env.FIREBASE_API_KEY;
  if (!apiKey) throw new Error("FIREBASE_API_KEY not set");

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message ?? "Credenciais inválidas");
  }

  const { idToken } = (await res.json()) as { idToken: string };
  return idToken;
}

export async function verifyIdToken(idToken: string): Promise<{ uid: string; email: string }> {
  const auth = getAdminAuth();
  const decoded = await auth.verifyIdToken(idToken);
  return { uid: decoded.uid, email: decoded.email ?? "" };
}

export async function ensureUserDoc(uid: string, email: string): Promise<User> {
  const db = getAdminFirestore();
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();

  if (snap.exists) {
    return { ...(snap.data() as User), uid };
  }

  const isFirst = (await db.collection("users").count().get()).data().count === 0;
  const newUser: Omit<User, "uid"> = {
    email,
    role: isFirst ? "admin" : "viewer",
  };

  await ref.set(newUser);
  return { ...newUser, uid };
}

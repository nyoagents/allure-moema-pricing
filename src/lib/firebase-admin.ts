import admin from "firebase-admin";
import type { App } from "firebase-admin/app";

function getApp(): App {
  // Reuse already-initialized app (Next.js hot reload guard)
  if (admin.apps.length > 0) {
    return admin.apps[0] as App;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase Admin env vars: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY"
    );
  }

  return admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
}

export function getAdminAuth() {
  return admin.auth(getApp());
}

export function getAdminFirestore() {
  const db = admin.firestore(getApp());
  // settings() throws if called after any Firestore operation — safe to swallow
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    // already configured, ignore
  }
  return db;
}

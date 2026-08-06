/**
 * Cria ou atualiza o documento /users/{uid} no Firestore para um usuário
 * já existente no Firebase Authentication.
 *
 * Uso:
 *   npx tsx scripts/create-admin-user.ts --email pricetax@alluremoema.com.br --role admin
 *   npx tsx scripts/create-admin-user.ts --email pricetax@alluremoema.com.br --role viewer
 */

import * as admin from "firebase-admin";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error("❌ Variáveis Firebase não encontradas.");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
});

const db = admin.firestore();
const auth = admin.auth();

const args = process.argv.slice(2);
const getArg = (flag: string) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : undefined; };

const email = getArg("--email");
const role = (getArg("--role") ?? "admin") as "admin" | "viewer";

if (!email) {
  console.error("❌ Uso: npx tsx scripts/create-admin-user.ts --email usuario@dominio.com [--role admin|viewer]");
  process.exit(1);
}

async function run() {
  console.log(`\n👤 Configurando usuário: ${email} (role: ${role})\n`);

  // Look up user in Firebase Auth
  let userRecord: admin.auth.UserRecord;
  try {
    userRecord = await auth.getUserByEmail(email!);
    console.log(`  ✓ Usuário encontrado no Firebase Auth: ${userRecord.uid}`);
  } catch {
    console.error(`  ✗ Usuário "${email}" não encontrado no Firebase Auth.`);
    console.error(`    Crie o usuário em: https://console.firebase.google.com/project/${projectId}/authentication/users`);
    process.exit(1);
  }

  // Create/update Firestore user doc
  const userDoc = {
    uid: userRecord.uid,
    email: userRecord.email ?? email,
    role,
    name: userRecord.displayName ?? email!.split("@")[0],
    updatedAt: new Date().toISOString(),
  };

  await db.collection("users").doc(userRecord.uid).set(userDoc, { merge: true });
  console.log(`  ✓ Documento /users/${userRecord.uid} salvo no Firestore`);
  console.log(`    role: ${role}`);
  console.log(`    email: ${userRecord.email}`);

  console.log(`\n✅ Pronto! O usuário pode fazer login em http://localhost:3000/login\n`);
  process.exit(0);
}

run().catch((e) => {
  console.error("❌ Erro:", e.message);
  process.exit(1);
});

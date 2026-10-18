import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { nowIso } from "@/lib/util";
import { audit } from "@/lib/audit";

/**
 * Encrypted credential vault for integrations Sean connects in-app.
 * AES-256-GCM; the key comes from CREDENTIALS_KEY (or is derived from
 * SESSION_SECRET). Secrets are never returned to the browser.
 */
function key() {
  return scryptSync(process.env.CREDENTIALS_KEY || env.sessionSecret, "sean-os-vault-v1", 32);
}

export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return { ciphertext: ct.toString("base64"), iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64") };
}

export function decrypt(row: { ciphertext: string; iv: string; tag: string }) {
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(row.iv, "base64"));
  d.setAuthTag(Buffer.from(row.tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(row.ciphertext, "base64")), d.final()]).toString("utf8");
}

export async function setCredential(provider: string, secret: string) {
  const db = getDb();
  const enc = encrypt(secret);
  await db.upsert("credentials", { id: provider, provider, ...enc, hint: `…${secret.slice(-4)}`, updated_at: nowIso() });
  await audit("sean", "credential.set", provider);
}

export async function getCredential(provider: string, envFallback?: string): Promise<string | null> {
  const row = await getDb().get("credentials", provider);
  if (row) {
    try {
      return decrypt(row);
    } catch {
      return null;
    }
  }
  return envFallback ?? null;
}

export async function removeCredential(provider: string) {
  await getDb().remove("credentials", provider);
  await audit("sean", "credential.remove", provider);
}

import "server-only";
import { randomBytes } from "node:crypto";

function opt(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

let ephemeral: string | null = null;

/** Typed server configuration. Secrets are never sent to the client. */
export const env = {
  isProd: process.env.NODE_ENV === "production",
  dataDir: opt("DATA_DIR") ?? opt("RAILWAY_VOLUME_MOUNT_PATH") ?? (process.env.VERCEL ? "/tmp/sean-os" : ".data"),
  /** Owner passcode. Required in production; development is open when unset. */
  ownerPasscode: opt("OWNER_PASSCODE"),
  get sessionSecret(): string {
    const v = opt("SESSION_SECRET");
    if (v) return v;
    if (process.env.NODE_ENV === "production") {
      ephemeral ??= randomBytes(32).toString("hex");
      return ephemeral;
    }
    return "dev-only-session-secret";
  },
  anthropicApiKey: opt("ANTHROPIC_API_KEY"),
  supabaseUrl: opt("SUPABASE_URL"),
  supabaseServiceRoleKey: opt("SUPABASE_SERVICE_ROLE_KEY"),
  supabaseBucket: opt("SUPABASE_STORAGE_BUCKET") ?? "sean-os",
  falKey: opt("FAL_KEY"),
  /** Optional semantic search for the world model (Voyage AI embeddings). */
  voyageApiKey: opt("VOYAGE_API_KEY"),
  voyageModel: opt("VOYAGE_MODEL") ?? "voyage-3.5-lite",
  falImageModel: opt("FAL_IMAGE_MODEL") ?? "fal-ai/nano-banana",
  vapidPublicKey: opt("VAPID_PUBLIC_KEY"),
  vapidPrivateKey: opt("VAPID_PRIVATE_KEY"),
  vapidSubject: opt("VAPID_SUBJECT") ?? "mailto:owner@example.com",
  cronSecret: opt("CRON_SECRET"),
  disableWorker: opt("DISABLE_WORKER") === "1",
};

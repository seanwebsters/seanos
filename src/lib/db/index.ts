import path from "node:path";
import { env } from "@/lib/env";
import { LocalDatabase } from "./local";
import { SupabaseDatabase } from "./supabase";
import type { Database } from "./types";

export * from "./types";

const g = globalThis as unknown as { __seanDb?: Database };

export function getDb(): Database {
  if (g.__seanDb) return g.__seanDb;
  if (env.supabaseUrl && env.supabaseServiceRoleKey) {
    g.__seanDb = new SupabaseDatabase(env.supabaseUrl, env.supabaseServiceRoleKey);
  } else {
    g.__seanDb = LocalDatabase.fromFile(path.resolve(process.cwd(), env.dataDir, "sean-os.json"));
  }
  return g.__seanDb;
}

/** Test hook. */
export function setDb(db: Database | undefined) {
  g.__seanDb = db;
}

import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { getDb } from "@/lib/db";
import { newId, nowIso } from "@/lib/util";

/** Stores a binary file and returns its app URL (/api/files/:id). */
export async function saveFile(data: Buffer, mime: string): Promise<string> {
  const id = newId("file");
  const db = getDb();
  if (db.backend === "supabase" && env.supabaseUrl && env.supabaseServiceRoleKey) {
    const sb = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, { auth: { persistSession: false } });
    const path = `${id}`;
    const { error } = await sb.storage.from(env.supabaseBucket).upload(path, data, { contentType: mime });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
    await db.insert("files", { id, mime, size: data.length, data: null, storage_path: path, created_at: nowIso() });
  } else {
    await db.insert("files", { id, mime, size: data.length, data: data.toString("base64"), storage_path: null, created_at: nowIso() });
  }
  return `/api/files/${id}`;
}

export async function readFile(id: string): Promise<{ data: Buffer; mime: string } | null> {
  const db = getDb();
  const row = await db.get("files", id);
  if (!row) return null;
  if (row.data) return { data: Buffer.from(row.data, "base64"), mime: row.mime };
  if (row.storage_path && env.supabaseUrl && env.supabaseServiceRoleKey) {
    const sb = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, { auth: { persistSession: false } });
    const { data, error } = await sb.storage.from(env.supabaseBucket).download(row.storage_path);
    if (error || !data) return null;
    return { data: Buffer.from(await data.arrayBuffer()), mime: row.mime };
  }
  return null;
}

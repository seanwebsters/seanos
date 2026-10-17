import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, ListOptions, TableName, Tables, Where } from "./types";

/**
 * Supabase/PostgreSQL adapter. Runs server-side only with the service-role
 * key; RLS in the migration denies all access to the anon key, so data is
 * reachable only through the app's authenticated API.
 */
export class SupabaseDatabase implements Database {
  readonly backend = "supabase" as const;
  private client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private where(q: any, where?: Where<unknown>) {
    for (const [k, v] of Object.entries((where ?? {}) as Record<string, unknown>)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) q = q.in(k, v);
      else if (v === null) q = q.is(k, null);
      else q = q.eq(k, v);
    }
    return q;
  }

  private fail(op: string, table: string, message: string): never {
    throw new Error(`[supabase] ${op} ${table}: ${message}`);
  }

  async list<K extends TableName>(table: K, opts: ListOptions<Tables[K]> = {}) {
    let q = this.where(this.client.from(table).select("*"), opts.where as Where<unknown>);
    if (opts.orderBy) q = q.order(opts.orderBy.column, { ascending: opts.orderBy.ascending ?? true });
    if (opts.limit !== undefined) q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) this.fail("list", table, error.message);
    return (data ?? []) as Tables[K][];
  }

  async get<K extends TableName>(table: K, id: string) {
    const { data, error } = await this.client.from(table).select("*").eq("id", id).maybeSingle();
    if (error) this.fail("get", table, error.message);
    return (data ?? null) as Tables[K] | null;
  }

  async insert<K extends TableName>(table: K, row: Tables[K]) {
    const { data, error } = await this.client.from(table).insert(row as never).select("*").single();
    if (error) this.fail("insert", table, error.message);
    return data as Tables[K];
  }

  async upsert<K extends TableName>(table: K, row: Tables[K]) {
    const { data, error } = await this.client.from(table).upsert(row as never).select("*").single();
    if (error) this.fail("upsert", table, error.message);
    return data as Tables[K];
  }

  async update<K extends TableName>(table: K, id: string, patch: Partial<Tables[K]>) {
    const { data, error } = await this.client.from(table).update(patch as never).eq("id", id).select("*").single();
    if (error) this.fail("update", table, error.message);
    return data as Tables[K];
  }

  async remove<K extends TableName>(table: K, id: string) {
    const { error } = await this.client.from(table).delete().eq("id", id);
    if (error) this.fail("delete", table, error.message);
  }

  async count<K extends TableName>(table: K, where?: Where<Tables[K]>) {
    const q = this.where(this.client.from(table).select("id", { count: "exact", head: true }), where as Where<unknown>);
    const { count, error } = await q;
    if (error) this.fail("count", table, error.message);
    return count ?? 0;
  }
}

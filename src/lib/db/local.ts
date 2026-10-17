import fs from "node:fs";
import path from "node:path";
import { matches, TABLE_NAMES, type Database, type ListOptions, type TableName, type Tables, type Where } from "./types";

export type Snapshot = { [K in TableName]: Tables[K][] };

export function emptySnapshot(): Snapshot {
  const snap = {} as Record<TableName, unknown[]>;
  for (const t of TABLE_NAMES) snap[t] = [];
  return snap as Snapshot;
}

const clone = <T,>(v: T): T => structuredClone(v);
const idOf = (r: unknown) => (r as { id: string }).id;

/**
 * In-memory store with atomic JSON-file persistence. Used for local use,
 * single-server hosting with a volume (Railway, Fly, a VPS) and tests.
 */
export class LocalDatabase implements Database {
  readonly backend = "local" as const;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(private data: Snapshot, private readonly filePath: string | null = null) {
    for (const t of TABLE_NAMES) if (!this.data[t]) (this.data as Record<string, unknown[]>)[t] = [];
  }

  static fromFile(filePath: string): LocalDatabase {
    const snap = fs.existsSync(filePath) ? (JSON.parse(fs.readFileSync(filePath, "utf8")) as Snapshot) : emptySnapshot();
    return new LocalDatabase(snap, filePath);
  }

  private rows<K extends TableName>(t: K): Tables[K][] {
    // Tables added in newer versions appear empty in older data files.
    (this.data as Record<string, unknown[]>)[t] ??= [];
    return this.data[t] as Tables[K][];
  }

  private persist() {
    if (!this.filePath || this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.persistNow();
    }, 50);
  }

  persistNow() {
    if (!this.filePath) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.filePath);
  }

  async list<K extends TableName>(table: K, opts: ListOptions<Tables[K]> = {}) {
    let out = this.rows(table).filter((r) => matches(r, opts.where));
    if (opts.orderBy) {
      const { column, ascending = true } = opts.orderBy;
      out = [...out].sort((a, b) => {
        const av = a[column] as unknown, bv = b[column] as unknown;
        if (av === bv) return 0;
        if (av === null || av === undefined) return 1;
        if (bv === null || bv === undefined) return -1;
        return ((av as never) < (bv as never) ? -1 : 1) * (ascending ? 1 : -1);
      });
    }
    if (opts.limit !== undefined) out = out.slice(0, opts.limit);
    return clone(out);
  }

  async get<K extends TableName>(table: K, id: string) {
    const row = this.rows(table).find((r) => idOf(r) === id);
    return row ? clone(row) : null;
  }

  async insert<K extends TableName>(table: K, row: Tables[K]) {
    if (this.rows(table).some((r) => idOf(r) === idOf(row))) throw new Error(`Duplicate primary key ${table}.${idOf(row)}`);
    this.rows(table).push(clone(row));
    this.persist();
    return clone(row);
  }

  async upsert<K extends TableName>(table: K, row: Tables[K]) {
    const rows = this.rows(table);
    const i = rows.findIndex((r) => idOf(r) === idOf(row));
    if (i >= 0) rows[i] = clone(row);
    else rows.push(clone(row));
    this.persist();
    return clone(row);
  }

  async update<K extends TableName>(table: K, id: string, patch: Partial<Tables[K]>) {
    const rows = this.rows(table);
    const i = rows.findIndex((r) => idOf(r) === id);
    if (i < 0) throw new Error(`Not found: ${table}.${id}`);
    rows[i] = { ...rows[i], ...clone(patch) };
    this.persist();
    return clone(rows[i]);
  }

  async remove<K extends TableName>(table: K, id: string) {
    const rows = this.rows(table);
    const i = rows.findIndex((r) => idOf(r) === id);
    if (i >= 0) rows.splice(i, 1);
    this.persist();
  }

  async count<K extends TableName>(table: K, where?: Where<Tables[K]>) {
    return this.rows(table).filter((r) => matches(r, where)).length;
  }
}

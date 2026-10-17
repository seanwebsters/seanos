import { randomUUID } from "node:crypto";

export const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
export const nowIso = () => new Date().toISOString();

export function dedupeKey(...parts: (string | null | undefined)[]): string {
  return parts
    .map((p) => (p ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim())
    .filter(Boolean)
    .join("|")
    .replace(/\b(the|a|an|inc|ltd|limited|llc|co)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Only keep http(s) URLs; agents must cite sources we can open. */
export function isUrl(u: unknown): u is string {
  if (typeof u !== "string") return false;
  try {
    const p = new URL(u);
    return p.protocol === "https:" || p.protocol === "http:";
  } catch {
    return false;
  }
}

export function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

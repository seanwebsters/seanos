import "server-only";
import * as z from "zod/v4";
import type { Source } from "@/lib/db/types";
import { isUrl } from "@/lib/util";

export const SourceZ = z.object({
  title: z.string(),
  url: z.string(),
  publisher: z.string().nullable(),
  date: z.string().nullable().describe("Publication date YYYY-MM-DD if shown, else null"),
});
export const ContactZ = z.object({
  name: z.string(),
  role: z.string(),
  url: z.string().describe("Public profile or page showing this person in this role"),
  email: z.string().nullable().describe("Only if published on a public page; else null"),
  source_url: z.string(),
});

function norm(u: string) {
  try {
    const p = new URL(u);
    return `${p.hostname.replace(/^www\./, "")}${p.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return u.toLowerCase();
  }
}

/**
 * Source verification: a cited URL counts only if it appeared in this
 * task's real web-search results (or a page under a found domain path).
 */
export class SourceVerifier {
  private found = new Set<string>();
  private hosts = new Set<string>();
  add(list: { url: string }[]) {
    for (const s of list) {
      if (!isUrl(s.url)) continue;
      this.found.add(norm(s.url));
      try {
        this.hosts.add(new URL(s.url).hostname.replace(/^www\./, ""));
      } catch {}
    }
  }
  /** Exact page match (normalised). */
  has(url: string | null | undefined): boolean {
    return Boolean(url && isUrl(url) && this.found.has(norm(url)));
  }
  /** Weaker check used for official pages: the domain was seen in search results. */
  hostSeen(url: string | null | undefined): boolean {
    if (!url || !isUrl(url)) return false;
    try {
      return this.hosts.has(new URL(url).hostname.replace(/^www\./, ""));
    } catch {
      return false;
    }
  }
  filter<T extends { url: string }>(sources: T[]): T[] {
    const seen = new Set<string>();
    return sources.filter((s) => {
      const k = norm(s.url);
      if (!this.has(s.url) || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  get size() {
    return this.found.size;
  }
}

export function toSources(list: z.infer<typeof SourceZ>[]): Source[] {
  return list.map((s) => ({ title: s.title, url: s.url, publisher: s.publisher, date: s.date }));
}

export function summariseList(label: string, items: string[]) {
  return items.length ? `${items.length} ${label}: ${items.slice(0, 4).join(", ")}${items.length > 4 ? "…" : ""}` : `No new ${label}`;
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const n = i++;
        out[n] = await fn(items[n]);
      }
    }),
  );
  return out;
}

export const SEARCH_RULE = "Use web search. Cite only URLs you actually opened or saw in search results during this task, copied exactly. If you can't verify an item, leave it out.";

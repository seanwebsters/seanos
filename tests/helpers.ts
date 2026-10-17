import { LocalDatabase, emptySnapshot } from "@/lib/db/local";
import { setDb, getDb } from "@/lib/db";
import { resetBootstrap, ensureBootstrapped } from "@/lib/bootstrap";
import { setTransport, type TransportRequest, type TransportResponse } from "@/lib/ai/llm";

export const FOUND = [
  { title: "Verge", url: "https://www.theverge.com/ai/1" },
  { title: "FT", url: "https://www.ft.com/content/abc" },
  { title: "Conf", url: "https://example-conf.com/speak" },
];

export type Responder = (req: TransportRequest, text: string) => unknown;

export async function setup(responder: Responder) {
  setDb(new LocalDatabase(emptySnapshot()));
  resetBootstrap();
  await ensureBootstrapped();
  const calls: TransportRequest[] = [];
  setTransport(async (req): Promise<TransportResponse> => {
    calls.push(req);
    const text = req.content.map((c) => ("text" in c ? c.text : "")).join("\n");
    const out = responder(req, text);
    return {
      text: typeof out === "string" ? out : JSON.stringify(out),
      model: req.model,
      usage: { input_tokens: 1000, output_tokens: 500, cache_read: 0, cache_write: 0, web_searches: req.webSearch ? 2 : 0 },
      sources: req.webSearch ? FOUND : [],
    };
  });
  globalThis.fetch = (async () => {
    throw new Error("network disabled in tests");
  }) as typeof fetch;
  return { db: getDb(), calls };
}

export const src = (url: string) => ({ title: "t", url, publisher: null, date: null });

import { getDb } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/api";
import { removeCredential, setCredential } from "@/lib/integrations/vault";

const PROVIDERS = { companies_house: "Companies House" } as const;

/** Lists connected providers (hints only; secrets never leave the server). */
export const GET = route(async () => {
  const rows = await getDb().list("credentials");
  return json({ providers: Object.entries(PROVIDERS).map(([k, label]) => ({ key: k, label, connected: rows.some((r) => r.provider === k) || (k === "companies_house" && Boolean(process.env.COMPANIES_HOUSE_API_KEY)), hint: rows.find((r) => r.provider === k)?.hint ?? null })) });
});

export const POST = route(async (req: Request) => {
  const b = await body<{ provider: string; secret?: string; remove?: boolean }>(req);
  if (!(b.provider in PROVIDERS)) throw new HttpError(400, "Unknown provider");
  if (b.remove) await removeCredential(b.provider);
  else {
    const s = String(b.secret ?? "").trim();
    if (s.length < 8 || s.length > 500) throw new HttpError(400, "That doesn't look like an API key.");
    await setCredential(b.provider, s);
  }
  return json({ ok: true });
});

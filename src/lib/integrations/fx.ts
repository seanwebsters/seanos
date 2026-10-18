import "server-only";

let cache: { at: number; value: { gbp_usd: number; as_of: string; source: string } } | null = null;

/** GBP→USD from the ECB reference rates via Frankfurter (free, no key). Dated, cached for 6 hours. */
export async function gbpUsd(): Promise<{ gbp_usd: number; as_of: string; source: string } | null> {
  if (cache && Date.now() - cache.at < 6 * 3600_000) return cache.value;
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=GBP&to=USD", { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { date: string; rates: { USD: number } };
    if (!j.rates?.USD) return null;
    cache = { at: Date.now(), value: { gbp_usd: j.rates.USD, as_of: j.date, source: "ECB reference rate via frankfurter.app" } };
    return cache.value;
  } catch {
    return null;
  }
}

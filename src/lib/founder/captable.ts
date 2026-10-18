/** Cap table and round maths. Pure functions; valuation ≠ cash ≠ personal wealth. */
import type { CapTable } from "@/lib/db/types";

export interface RoundResult {
  pre_money: number;
  amount: number;
  post_money: number;
  price_per_share: number;
  new_investor_shares: number;
  pool_top_up_shares: number;
  holders: { name: string; kind: string; before_pct: number; after_pct: number; shares_after: number; paper_value: number }[];
  investor_pct: number;
}

export function totalShares(holders: CapTable["holders"]) {
  return holders.reduce((s, h) => s + h.shares, 0);
}

/**
 * Priced round with an optional option-pool top-up that comes out of the
 * pre-money (the common "pool shuffle"): the post-money pool equals
 * pool_top_up_pct of the fully diluted post-round shares.
 */
export function simulateRound(holders: CapTable["holders"], pre_money: number, amount: number, pool_top_up_pct = 0): RoundResult {
  const before = totalShares(holders) || 1;
  const post_money = pre_money + amount;
  const investorFrac = post_money > 0 ? amount / post_money : 0;
  const existingPool = holders.filter((h) => h.kind === "pool").reduce((s, h) => s + h.shares, 0);
  const p = Math.max(0, pool_top_up_pct / 100);
  // Pool shuffle: the post-round pool equals p of post-round shares, created before the investor's price is set.
  // T = B + U + I, I = f·T, P0 + U = p·T  ⇒  T = (B − P0) ÷ (1 − f − p)
  let total = p > 0 ? (before - existingPool) / Math.max(1e-9, 1 - investorFrac - p) : before / Math.max(1e-9, 1 - investorFrac);
  let topUp = p > 0 ? p * total - existingPool : 0;
  if (topUp < 0) { topUp = 0; total = before / Math.max(1e-9, 1 - investorFrac); }
  const investorShares = total * investorFrac;
  const price = investorShares > 0 ? amount / investorShares : pre_money / before;
  const rows = holders.map((h) => {
    const shares_after = h.shares + (h.kind === "pool" ? topUp : 0);
    return { name: h.name, kind: h.kind, before_pct: h.shares / before, after_pct: shares_after / total, shares_after, paper_value: shares_after * price };
  });
  if (topUp > 0 && !holders.some((h) => h.kind === "pool")) rows.push({ name: "Option pool (new)", kind: "pool", before_pct: 0, after_pct: topUp / total, shares_after: topUp, paper_value: topUp * price });
  return { pre_money, amount, post_money, price_per_share: price, new_investor_shares: investorShares, pool_top_up_shares: topUp, holders: rows, investor_pct: investorFrac };
}

/** "What would selling X% mean?" for a given raise. */
export function sellPercent(pct: number, amount: number) {
  const f = pct / 100;
  const post = f > 0 ? amount / f : 0;
  return { post_money: post, pre_money: post - amount, investor_pct: f };
}

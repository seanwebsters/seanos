import { getDb } from "@/lib/db";
import type { CapTable } from "@/lib/db/types";
import { body, HttpError, json, route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { ensureCapTable } from "@/lib/founder/core";
import { nowIso } from "@/lib/util";

const KINDS = ["founder", "investor", "pool", "other"] as const;

export const POST = route(async (req: Request, { params }: { params: Promise<{ ventureId: string }> }) => {
  const { ventureId } = await params;
  if (!(await getDb().get("ventures", ventureId))) throw new HttpError(404, "Venture not found");
  const b = await body<{ holders?: { name: string; kind: string; shares: number }[]; rounds?: CapTable["rounds"]; currency?: string }>(req);
  const cap = await ensureCapTable(ventureId);
  const patch: Partial<CapTable> = { updated_at: nowIso() };
  if (b.holders) {
    patch.holders = b.holders.slice(0, 50).map((h) => {
      const shares = Number(h.shares);
      if (!Number.isFinite(shares) || shares < 0) throw new HttpError(400, "Shares must be a positive number");
      return { name: String(h.name ?? "").slice(0, 80) || "Holder", kind: (KINDS as readonly string[]).includes(h.kind) ? (h.kind as CapTable["holders"][number]["kind"]) : "other", shares: Math.round(shares) };
    });
    patch.basis = "user";
  }
  if (b.rounds) patch.rounds = b.rounds.slice(0, 20).map((r) => ({ name: String(r.name ?? "Round").slice(0, 60), pre_money: Math.max(0, Number(r.pre_money) || 0), amount: Math.max(0, Number(r.amount) || 0), pool_top_up_pct: Math.min(30, Math.max(0, Number(r.pool_top_up_pct) || 0)), status: r.status === "closed" ? "closed" : "modelled", date: typeof r.date === "string" ? r.date.slice(0, 10) : null }));
  if (b.currency === "GBP" || b.currency === "USD") patch.currency = b.currency;
  await getDb().update("cap_tables", cap.id, patch);
  await audit("sean", "captable.save", `venture:${ventureId}`, Object.keys(patch).join(", "));
  return json({ cap: { ...cap, ...patch } });
});

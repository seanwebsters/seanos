import { getDb } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/api";
import { categorise, parseBankCsv, txnHash } from "@/lib/finance";
import { createTask } from "@/lib/engine";
import { env } from "@/lib/env";
import { newId, nowIso } from "@/lib/util";

/** Imports a bank statement CSV. Duplicate rows (same date, description and amount) are skipped. */
export const POST = route(async (req: Request) => {
  const { csv, account_id } = await body<{ csv: string; account_id?: string | null }>(req);
  if (typeof csv !== "string" || csv.length > 5_000_000) throw new HttpError(400, "Upload a CSV under 5 MB.");
  const { rows, skipped, columns } = parseBankCsv(csv);
  if (!rows.length) throw new HttpError(400, `Couldn't find date, description and amount columns${columns.length ? ` (saw: ${columns.slice(0, 8).join(", ")})` : ""}.`);
  const db = getDb();
  const known = new Set((await db.list("transactions")).map((t) => t.import_hash).filter(Boolean));
  let added = 0, dupes = 0, other = 0;
  for (const r of rows) {
    const hash = txnHash(r);
    if (known.has(hash)) { dupes++; continue; }
    known.add(hash);
    const category = r.category ?? categorise(r.description, r.amount);
    if (category === "Other") other++;
    await db.insert("transactions", { id: newId("txn"), date: r.date, description: r.description, amount: r.amount, category, account_id: account_id ?? null, source: "csv", import_hash: hash, notes: "", created_at: nowIso() });
    added++;
  }
  const task = other > 0 && env.anthropicApiKey ? await createTask({ title: "Categorise imported transactions", kind: "finance_categorise" }) : null;
  return json({ added, dupes, skipped, uncategorised: other, task });
});

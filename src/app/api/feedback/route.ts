import { getDb } from "@/lib/db";
import type { Scope } from "@/lib/db/types";
import { body, HttpError, json, route } from "@/lib/api";
import { newId, nowIso } from "@/lib/util";

const SIGNALS: Record<string, string> = {
  more: "More like this",
  less: "Less like this",
  corporate: "Too corporate",
  never: "Don't recommend this again",
  style: "This is exactly my style",
  similar_people: "Find more people like this",
  develop: "Develop this idea",
  great: "Great find",
};

const CATEGORY: Record<string, { category: string; scope: Scope }> = {
  story: { category: "Edition", scope: "personal" },
  draft: { category: "Writing", scope: "personal" },
  person: { category: "People", scope: "personal" },
  partnership: { category: "Calmlings", scope: "work" },
  idea: { category: "Ideas", scope: "personal" },
  trend: { category: "Trends", scope: "personal" },
  speaking: { category: "Speaking", scope: "personal" },
  experience: { category: "London", scope: "personal" },
  outfit: { category: "Style", scope: "personal" },
  wardrobe: { category: "Style", scope: "personal" },
};

/** Turns feedback into memory the agents read, plus any direct effect. */
export const POST = route(async (req: Request) => {
  const b = await body<{ target: string; id: string; title: string; signal: string; note?: string }>(req);
  const label = SIGNALS[b.signal];
  const cat = CATEGORY[b.target];
  if (!label || !cat) throw new HttpError(400, "Unknown feedback");
  const db = getDb();
  await db.insert("memories", {
    id: newId("mem"), category: cat.category, content: `${label}: "${String(b.title).slice(0, 160)}"${b.note ? ` (${b.note})` : ""}`, kind: "feedback", scope: cat.scope,
    source: "feedback", provenance: `${b.target}:${b.id}`, confidence: 1, pinned: false, created_at: nowIso(), updated_at: nowIso(),
  });
  if (b.signal === "never") {
    if (b.target === "person") await db.update("people", b.id, { status: "dismissed" }).catch(() => {});
    if (b.target === "trend") await db.update("trends", b.id, { status: "dismissed" }).catch(() => {});
    if (b.target === "speaking") await db.update("speaking", b.id, { status: "dismissed" }).catch(() => {});
    if (b.target === "experience") await db.update("experiences", b.id, { status: "dismissed" }).catch(() => {});
    if (b.target === "partnership") await db.update("partnerships", b.id, { status: "passed" }).catch(() => {});
  }
  return json({ ok: true });
});

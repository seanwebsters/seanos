import { after } from "next/server";
import { getDb } from "@/lib/db";
import type { Venture } from "@/lib/db/types";
import { body, HttpError, json, route } from "@/lib/api";
import { createTask, runTask } from "@/lib/engine";
import { audit } from "@/lib/audit";
import { ventureByName } from "@/lib/founder/core";
import { rateLimit } from "@/lib/rate-limit";
import { newId, nowIso } from "@/lib/util";

/** Idea → business: creates a venture record and starts the build pipeline. */
export const POST = route(async (req: Request) => {
  rateLimit("founder:new", 10, 60_000);
  const b = await body<{ name?: string; idea?: string; build?: boolean }>(req);
  const idea = (b.idea ?? "").trim().slice(0, 4000);
  const name = (b.name ?? "").trim().slice(0, 80) || idea.split(/[.:\n]/)[0].slice(0, 60);
  if (!name) throw new HttpError(400, "Give the idea a name or a sentence.");
  if (await ventureByName(name)) throw new HttpError(409, `${name} already exists in your portfolio.`);
  const v: Venture = {
    id: newId("ven"), name, tagline: idea.slice(0, 200), category: "", stage: "concept", status: "draft", thesis: "", customer: "", market: "", competition: "", business_model: "", validation: "", product: "", roadmap: "",
    ownership: "unclear", ip_notes: "", licensing: "", confidentiality: "personal", conflicts: [], incorporated: false, priority: 20, health: null, idea_id: null, merged_into: null, tags: [], is_demo: false, created_at: nowIso(), updated_at: nowIso(),
  };
  await getDb().insert("ventures", v);
  await audit("sean", "venture.create", `venture:${v.id}`, name);
  let task = null;
  if (b.build !== false) {
    task = await createTask({ title: `${name}: build the business`, instruction: idea || name, kind: "venture_build", params: { venture_id: v.id, raw_idea: idea }, contextRef: { type: "venture", id: v.id, title: name } });
    await getDb().update("ventures", v.id, { status: "running" });
    if (process.env.VERCEL) after(() => runTask(task!.id).then(() => undefined));
  }
  return json({ venture: v, task });
});

export const maxDuration = 300;

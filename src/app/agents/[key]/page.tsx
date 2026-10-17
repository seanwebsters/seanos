import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { AGENT_BY_KEY, isAgentKey } from "@/lib/ai/agents";
import { getSettings } from "@/lib/bootstrap";
import { MODELS } from "@/lib/ai/llm";
import { relTime } from "@/lib/time";
import { AgentBadge, Empty, List, PageHeader, Pill, Row, Section } from "@/components/ui";
import { AskButton } from "@/components/client";
import { AgentSettings } from "./settings";

export const dynamic = "force-dynamic";

export default async function AgentPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!isAgentKey(key)) notFound();
  const def = AGENT_BY_KEY[key];
  const db = getDb();
  const override = await db.get("agent_overrides", key);
  const settings = await getSettings();
  const steps = (await db.list("task_steps", { where: { agent: key }, orderBy: { column: "started_at", ascending: false }, limit: 30 }));
  const tasks = await db.list("tasks");
  const usage = (await db.list("usage", { where: { agent: key } })).reduce((s, u) => s + u.cost_cents, 0);
  return (
    <div>
      <PageHeader back="/agents" title={def.name} eyebrow="Agent" subtitle={def.role} actions={<AskButton label={`Brief`} />} />
      <div className="mx-5 mt-2 flex items-center gap-3 lg:mx-0">
        <AgentBadge agent={key} size={52} />
        <div className="text-[13px] text-muted">
          <div>{steps.filter((s) => s.status === "done").length} steps completed · ${(usage / 100).toFixed(2)} spent</div>
          <div>Reads memory: {def.scopes.join(", ")}{def.scopes.includes("work") ? "" : " (no Calm confidential)"}</div>
        </div>
      </div>
      <Section title="Work">
        {steps.length ? (
          <List>
            {steps.map((s) => {
              const t = tasks.find((x) => x.id === s.task_id);
              return <Row key={s.id} href={`/tasks/${s.task_id}`} title={s.title} sub={`${t?.title ?? ""} · ${s.started_at ? relTime(s.started_at) : ""}${s.error ? ` · ${s.error}` : ""}`} right={<Pill status={s.status === "done" ? "completed" : s.status} />} />;
            })}
          </List>
        ) : <Empty title="Hasn't worked yet" body="This agent's steps, outputs and costs will show here." />}
      </Section>
      <Section title="Instructions">
        <AgentSettings agentKey={key} defaults={def.instructions} instructions={override?.instructions ?? null} model={override?.model ?? null} enabled={override?.enabled ?? true} models={MODELS} defaultModel={def.fast ? settings.fast_model : settings.default_model} />
      </Section>
      <div className="mx-5 mt-6 lg:mx-0"><Link href="/automations" className="text-[13px] text-accent">See this agent's automations →</Link></div>
    </div>
  );
}

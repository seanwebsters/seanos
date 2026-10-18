import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import type { VentureDoc } from "@/lib/db/types";
import { AgentBadge, Art, Markdown, Notice, PageHeader, Pill, Sources, Tabs, agentName } from "@/components/ui";
import { ActionButton, CreateForm, EditField, LiveRefresh } from "@/components/client";
import { BasisTag, Checklist, CompaniesSearch, CopilotChat, ModelEditor, PipelineControls, RoundSim, TaskCheck, VentureManage } from "@/components/founder";
import { Icon } from "@/components/Icon";
import { ensureCapTable, getModel } from "@/lib/founder/core";
import { money, runModel } from "@/lib/founder/finmodel";
import { FOUNDER_KINDS, progressOf } from "@/lib/founder/views";
import { fmtDate, relTime } from "@/lib/time";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "overview", label: "Overview" }, { key: "strategy", label: "Strategy" }, { key: "finance", label: "Finance" }, { key: "funding", label: "Funding" },
  { key: "investors", label: "Investors" }, { key: "tasks", label: "Tasks" }, { key: "risks", label: "Risks & legal" }, { key: "docs", label: "Docs" }, { key: "history", label: "History" },
];

function DocCard({ doc, edit = true }: { doc: VentureDoc; edit?: boolean }) {
  return (
    <div className="card mx-5 p-5 lg:mx-0">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="display mr-auto text-[24px] leading-tight">{doc.title}</h3>
        <BasisTag basis={doc.basis} />
        <span className="text-[11.5px] text-faint">v{doc.version} · {agentName(doc.agent)} · {relTime(doc.updated_at)}</span>
      </div>
      {doc.body && <Markdown text={doc.body} className="prose-sean mt-3" />}
      {edit && doc.body && (
        <details className="mt-3"><summary className="cursor-pointer text-[12.5px] text-muted">Edit</summary><div className="mt-2"><EditField table="venture_docs" id={doc.id} field="body" value={doc.body} multiline /></div></details>
      )}
      <Sources sources={doc.sources} />
    </div>
  );
}

export default async function VenturePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const tab = (await searchParams).tab ?? "overview";
  const db = getDb();
  const v = await db.get("ventures", id);
  if (!v) notFound();
  const docs = await db.list("venture_docs", { where: { venture_id: id } });
  const doc = (k: string) => docs.find((d) => d.kind === k);
  const model = await getModel(id);
  const live = model && model.version > 0 ? model : undefined;
  const tasks = (await db.list("venture_tasks", { where: { venture_id: id } })).sort((a, b) => (a.due ?? "9").localeCompare(b.due ?? "9"));
  const pipeline = (await db.list("investor_pipeline", { where: { venture_id: id } })).sort((a, b) => b.fit_score - a.fit_score);
  const investors = new Map((await db.list("investors")).map((i) => [i.id, i]));
  const engine = (await db.list("tasks", { orderBy: { column: "created_at", ascending: false }, limit: 300 })).filter((t) => FOUNDER_KINDS.includes(t.kind) && (t.params.venture_id === id || t.context_ref?.id === id));
  const running = engine.find((t) => ["queued", "running"].includes(t.status));
  const others = (await db.list("ventures")).filter((x) => x.id !== id && x.stage !== "archived" && !x.merged_into).map((x) => ({ id: x.id, name: x.name }));
  const progress = progressOf(v, docs, live, tasks);
  const k = live ? runModel(live).kpis : null;
  const ctx = { type: "venture", id, title: v.name };
  const built = Boolean(doc("strategy"));

  return (
    <div className="wide pb-10">
      <LiveRefresh active={Boolean(running)} every={4000} />
      <PageHeader back="/founder" eyebrow={`${v.category || "Venture"} · ${v.stage}`} title={v.name} subtitle={v.tagline} actions={<Pill status={running ? "running" : v.status} label={running ? "agents working" : v.status.replace("_", " ")} />} />
      <div className="mt-2 flex flex-wrap items-center gap-2 px-5 lg:px-0">
        {running ? (
          <Link href={`/tasks/${running.id}`} className="btn-ghost"><span className="h-2 w-2 animate-pulse2 rounded-full bg-sky" /> {running.title} · {Math.round(running.progress * 100)}%</Link>
        ) : (
          <ActionButton url={`/api/founder/ventures/${id}`} body={{ action: "build" }} className="btn-primary" toastText="The team is building it">
            <Icon name="rocket" size={15} /> {built ? "Rebuild the business" : "Build the business"}
          </ActionButton>
        )}
        <VentureManage id={id} others={others} archived={v.stage === "archived"} />
      </div>
      {v.merged_into && <div className="mt-3"><Notice>Merged into another venture. <Link className="underline" href={`/founder/v/${v.merged_into}`}>Open it</Link>.</Notice></div>}
      {v.conflicts.length > 0 && <div className="mt-3"><Notice tone="warn"><b>Possible Calm conflict.</b> {v.conflicts[0]}{v.conflicts.length > 1 ? ` (+${v.conflicts.length - 1} more in Risks & legal)` : ""}</Notice></div>}

      <div className="mt-3"><Tabs base={`/founder/v/${id}`} active={tab} tabs={TABS.map((t) => ({ ...t, count: t.key === "investors" ? pipeline.length : t.key === "tasks" ? tasks.filter((x) => x.status !== "done").length : undefined }))} /></div>

      {tab === "overview" && (
        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            <div className="mx-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:mx-0">
              <Mini label="Progress" value={`${progress}%`} sub="from what exists" />
              <Mini label="Health" value={v.health ? `${v.health.score}/100` : "–"} sub={v.health?.reasons[0] ?? "after a build"} />
              <Mini label="Funding need" value={k ? money(k.funding_need, live!.currency) : "–"} sub={k ? "forecast, base" : "no model yet"} />
              <Mini label="Investors" value={String(pipeline.length)} sub="verified, in pipeline" />
            </div>
            {doc("cofounder") ? <DocCard doc={doc("cofounder")!} edit={false} /> : (
              <div className="card mx-5 p-5 lg:mx-0">
                <h3 className="display text-[24px]">Turn this into a business</h3>
                <p className="mt-1 text-[14px] text-muted">One tap runs the full pipeline: strategy and market research, a driver-based financial model, funding requirements, a fundraising plan with readiness checklist, data room and deck, a verified investor shortlist, a 30/60/90-day plan and a legal & IP checklist. Everything is saved here and editable. Nothing is sent.</p>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {[["thesis", "Thesis"], ["customer", "Customer"], ["business_model", "Business model"], ["validation", "Validation plan"]].map(([f, l]) => (
                <div key={f} className="card mx-5 p-4 sm:mx-0"><div className="eyebrow mb-1.5">{l}</div><Markdown text={(v as unknown as Record<string, string>)[f] || "*Not yet defined.*"} className="prose-sean text-[14px]" /></div>
              ))}
            </div>
          </div>
          <aside className="space-y-5">
            <div className="card mx-5 overflow-hidden lg:mx-0">
              <Art seed={v.name} className="h-28"><span className="absolute bottom-3 left-4 font-display text-[30px] text-white">{v.name}</span></Art>
              <div className="space-y-2 p-4 text-[13px]">
                <div className="flex justify-between"><span className="text-muted">Ownership</span><span className={v.ownership === "unclear" ? "text-rose" : ""}>{v.ownership}</span></div>
                <div className="flex justify-between"><span className="text-muted">Incorporated</span><span>{v.incorporated ? "Yes" : "No"}</span></div>
                <div className="flex justify-between"><span className="text-muted">Confidentiality</span><span>{v.confidentiality}</span></div>
                <div className="flex justify-between"><span className="text-muted">Record</span><span>{v.is_demo ? "Demo" : v.stage === "concept" && !built ? "Proposed concept" : "Your venture"}</span></div>
              </div>
            </div>
            <div className="card mx-5 flex flex-col overflow-hidden lg:mx-0">
              <div className="px-4 pt-4 text-[15px] font-medium">Ask about {v.name}</div>
              <CopilotChat thread={`v:${id}`} suggestions={[`What's the riskiest assumption in ${v.name}?`, "Be more conservative on growth and update the model", "Find investors focused on this sector"]} />
            </div>
          </aside>
        </div>
      )}

      {tab === "strategy" && (
        <div className="mt-4 space-y-5">
          {doc("strategy") ? <DocCard doc={doc("strategy")!} /> : <Notice>No strategy yet. Run <b>Build the business</b>.</Notice>}
          <div className="grid gap-3 lg:grid-cols-2">
            {([["name", "Name"], ["tagline", "One-liner"], ["category", "Category"], ["thesis", "Thesis"], ["customer", "Target customer"], ["market", "Market"], ["competition", "Competition"], ["business_model", "Business model & pricing"], ["product", "Product / MVP"], ["roadmap", "Roadmap"]] as const).map(([f, l]) => (
              <div key={f} className="mx-5 lg:mx-0"><div className="eyebrow mb-1.5">{l}</div><EditField table="ventures" id={id} field={f} value={String(v[f] ?? "")} multiline={!["name", "tagline", "category"].includes(f)} /></div>
            ))}
          </div>
          {doc("validation") && <div className="space-y-2"><div className="eyebrow px-5 lg:px-0">Validation experiments</div><Checklist doc={doc("validation")!} /></div>}
        </div>
      )}

      {tab === "finance" && (
        <div className="mt-4 space-y-5">
          {model && model.version > 0 ? <ModelEditor model={model} ventureId={id} ventureName={v.name} /> : (
            <div className="card mx-5 p-5 lg:mx-0">
              <h3 className="display text-[24px]">No model yet</h3>
              <p className="mt-1 text-[14px] text-muted">The CFO agent builds a driver-based 36-month model with base, upside and downside cases, labelling every assumption as verified (with a source) or estimated. You can then edit any driver.</p>
              <div className="mt-3"><ActionButton url={`/api/founder/ventures/${id}`} body={{ action: "model" }} className="btn-primary">Build the model</ActionButton></div>
            </div>
          )}
          {doc("funding_requirements") && <DocCard doc={doc("funding_requirements")!} edit={false} />}
          {model && model.version > 0 && <Versions ventureId={id} />}
        </div>
      )}

      {tab === "funding" && <FundingTab id={id} docs={docs} />}

      {tab === "investors" && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 px-5 lg:px-0">
            <ActionButton url={`/api/founder/ventures/${id}`} body={{ action: "investors" }} className="btn-primary"><Icon name="search" size={14} /> Find more investors</ActionButton>
            <span className="text-[12px] text-faint">Only investors with a live, verifiable source are added. Contact details aren&apos;t guessed; nothing is sent.</span>
          </div>
          {pipeline.length ? pipeline.map((p) => {
            const inv = investors.get(p.investor_id);
            if (!inv) return null;
            return (
              <div key={p.id} className="card mx-5 p-4 lg:mx-0">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-raised font-bold">{inv.name[0]}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="text-[15px] font-semibold">{inv.name}</span>{inv.firm && inv.firm !== inv.name && <span className="text-[13px] text-muted">{inv.firm}</span>}<span className="rounded-full bg-raised px-2 py-0.5 text-[11px]">{inv.kind}</span><span className="text-[12px] text-muted">fit {p.fit_score}/10</span></div>
                    <div className="mt-1 text-[13px] text-muted">{inv.thesis}</div>
                    <div className="mt-1 text-[12px] text-faint">{[inv.stages.join(", "), inv.geography.join(", "), inv.cheque.stated && inv.cheque.min !== null ? `cheques ${money(inv.cheque.min, inv.cheque.currency === "USD" ? "USD" : "GBP")}–${money(inv.cheque.max ?? inv.cheque.min, inv.cheque.currency === "USD" ? "USD" : "GBP")} (stated)` : "cheque size not published"].filter(Boolean).join(" · ")}</div>
                    {p.fit_reasons.length > 0 && <ul className="mt-1.5 list-disc pl-4 text-[12.5px]">{p.fit_reasons.slice(0, 3).map((r) => <li key={r}>{r}</li>)}</ul>}
                    <div className="mt-1.5 flex flex-wrap gap-3 text-[12px]">
                      {inv.website && <a href={inv.website} target="_blank" rel="noreferrer" className="text-accent">Website</a>}
                      {inv.apply_url && <a href={inv.apply_url} target="_blank" rel="noreferrer" className="text-accent">Application route</a>}
                      {inv.sources.slice(0, 2).map((s) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="text-muted underline">{new URL(s.url).hostname.replace(/^www\./, "")}</a>)}
                      <span className="text-faint">verified {inv.last_verified}</span>
                    </div>
                    <div className="mt-2 text-[12.5px]"><span className="text-muted">Next: </span>{p.next_step}</div>
                    <div className="mt-2"><PipelineControls entry={p} /></div>
                  </div>
                </div>
              </div>
            );
          }) : <Notice>No investors yet.</Notice>}
        </div>
      )}

      {tab === "tasks" && (
        <div className="mt-4 space-y-5">
          {doc("plan_90") && <div className="card mx-5 p-4 text-[14px] lg:mx-0"><div className="eyebrow mb-1">90-day plan</div>{doc("plan_90")!.body}</div>}
          {(["30", "60", "90", "later"] as const).map((ph) => {
            const list = tasks.filter((t) => t.phase === ph);
            if (!list.length && ph !== "30") return null;
            return (
              <div key={ph}>
                <div className="eyebrow mb-2 px-5 lg:px-0">{ph === "later" ? "Later" : `Days ${ph === "30" ? "1–30" : ph === "60" ? "31–60" : "61–90"}`}</div>
                <div className="mx-5 divide-y divide-line overflow-hidden rounded-card bg-surface ring-1 ring-line/70 lg:mx-0">
                  {list.map((t) => (
                    <div key={t.id} className="flex items-start gap-3 px-4 py-3">
                      <span className="mt-0.5"><TaskCheck id={t.id} done={t.status === "done"} /></span>
                      <div className="min-w-0 flex-1">
                        <div className={`text-[14px] ${t.status === "done" ? "text-faint line-through" : ""}`}>{t.title}</div>
                        {t.detail && <div className="text-[12.5px] text-muted">{t.detail}</div>}
                        <div className="mt-0.5 text-[11.5px] text-faint">{t.owner.toLowerCase() === "sean" ? "You" : agentName(t.owner)}{t.due ? ` · due ${fmtDate(t.due)}` : ""}</div>
                      </div>
                      {t.owner.toLowerCase() !== "sean" && t.status !== "done" && (
                        <ActionButton url="/api/tasks" body={{ instruction: `${t.title}. ${t.detail}`, context_ref: ctx }} className="chip"><Icon name="bolt" size={12} /> Delegate</ActionButton>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          <AddTask ventureId={id} />
        </div>
      )}

      {tab === "risks" && (
        <div className="mt-4 space-y-5">
          <div className="card mx-5 p-5 lg:mx-0">
            <h3 className="display text-[22px]">Ownership, IP & Calm separation</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-[12px] text-muted">Ownership (independent / calm / joint / unclear)<EditField table="ventures" id={id} field="ownership" value={v.ownership} /></label>
              <label className="text-[12px] text-muted">Confidentiality (personal / work / public)<EditField table="ventures" id={id} field="confidentiality" value={v.confidentiality} /></label>
              <label className="text-[12px] text-muted sm:col-span-2">IP notes<EditField table="ventures" id={id} field="ip_notes" value={v.ip_notes} multiline /></label>
              <label className="text-[12px] text-muted sm:col-span-2">Licensing<EditField table="ventures" id={id} field="licensing" value={v.licensing} multiline /></label>
            </div>
            {v.conflicts.length > 0 && <ul className="mt-3 space-y-1.5">{v.conflicts.map((c) => <li key={c} className="rounded-xl bg-rose/10 px-3 py-2 text-[13px] text-rose">⚑ {c}</li>)}</ul>}
          </div>
          {doc("legal") ? <div className="space-y-2"><div className="eyebrow px-5 lg:px-0">{doc("legal")!.title}</div><Checklist doc={doc("legal")!} /><div className="px-5 text-[12px] text-faint lg:px-0">Coordination only, not legal advice. Items marked ⚖ need a qualified solicitor or accountant.</div></div> : null}
          {doc("risks") && <DocCard doc={doc("risks")!} />}
          <CompaniesSearch initial={v.name} connected={Boolean(process.env.COMPANIES_HOUSE_API_KEY) || Boolean(await db.get("credentials", "companies_house"))} />
        </div>
      )}

      {tab === "docs" && (
        <div className="mt-4 space-y-4">
          {docs.length ? docs.sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map((d) => (
            d.checklist.length && !d.body ? <div key={d.id} className="space-y-2"><div className="flex items-center gap-2 px-5 lg:px-0"><span className="text-[15px] font-medium">{d.title}</span><BasisTag basis={d.basis} /><span className="text-[11.5px] text-faint">v{d.version}</span></div><Checklist doc={d} /></div>
              : d.kind === "deck" ? <div key={d.id} className="card mx-5 flex items-center justify-between p-4 lg:mx-0"><span className="text-[15px] font-medium">{d.title} · {d.slides.length} slides</span><Link href={`/founder/v/${id}/deck`} className="chip">Present</Link></div>
              : <DocCard key={d.id} doc={d} />
          )) : <Notice>No documents yet.</Notice>}
        </div>
      )}

      {tab === "history" && (
        <div className="mt-4 space-y-2">
          {engine.length ? (
            <div className="mx-5 divide-y divide-line overflow-hidden rounded-card bg-surface ring-1 ring-line/70 lg:mx-0">
              {engine.map((t) => (
                <Link key={t.id} href={`/tasks/${t.id}`} className="flex items-center gap-3 px-4 py-3">
                  <AgentBadge agent={t.agent} size={28} />
                  <div className="min-w-0 flex-1"><div className="truncate text-[14px]">{t.title}</div><div className="line-clamp-2 text-[12px] text-muted">{t.summary ?? t.error ?? ""}</div></div>
                  <div className="text-right"><Pill status={t.status} /><div className="mt-1 text-[11px] text-faint">{relTime(t.created_at)} · {(t.cost_cents / 100).toLocaleString("en-GB", { style: "currency", currency: "USD" })}</div></div>
                </Link>
              ))}
            </div>
          ) : <Notice>No agent work yet.</Notice>}
        </div>
      )}
    </div>
  );
}

function Mini({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="card p-3.5"><div className="text-[11.5px] text-muted">{label}</div><div className="mt-0.5 text-[22px] font-semibold tabular-nums">{value}</div><div className="truncate text-[11px] text-faint">{sub}</div></div>;
}

async function Versions({ ventureId }: { ventureId: string }) {
  const versions = (await getDb().list("fin_model_versions", { where: { venture_id: ventureId } })).sort((a, b) => b.version - a.version).slice(0, 12);
  return (
    <div className="card mx-5 p-4 lg:mx-0">
      <div className="text-[14px] font-medium">Version history</div>
      <div className="mt-2 divide-y divide-line">
        {versions.map((x, i) => (
          <div key={x.id} className="flex items-center gap-3 py-2 text-[13px]">
            <span className="w-8 font-semibold tabular-nums">v{x.version}</span>
            <span className="min-w-0 flex-1"><span className="block truncate">{x.change_note}</span><span className="block truncate text-[11px] text-faint">{x.by === "sean" ? "You" : x.by.replace("agent:", "")} · {relTime(x.at)}{x.changed.length ? ` · ${x.changed.slice(0, 4).join(", ")}` : ""}</span></span>
            {i > 0 && <ActionButton url={`/api/founder/model/${ventureId}`} body={{ action: "restore", version: x.version }} className="chip" confirm={`Restore v${x.version} as a new version?`}>Restore</ActionButton>}
          </div>
        ))}
      </div>
    </div>
  );
}

async function FundingTab({ id, docs }: { id: string; docs: VentureDoc[] }) {
  const doc = (k: string) => docs.find((d) => d.kind === k);
  const cap = await ensureCapTable(id);
  return (
    <div className="mt-4 grid gap-5 lg:grid-cols-2">
      <div className="space-y-5">
        {doc("funding_plan") ? <DocCard doc={doc("funding_plan")!} /> : (
          <div className="card mx-5 p-5 lg:mx-0"><h3 className="display text-[22px]">No funding plan yet</h3><p className="mt-1 text-[13.5px] text-muted">The Fundraising agent recommends a route (bootstrap, grants, angels, accelerator, VC…) from the model&apos;s funding need, then prepares the round, readiness checklist, data room, memo, deck and FAQ.</p><div className="mt-3"><ActionButton url={`/api/founder/ventures/${id}`} body={{ action: "funding" }} className="btn-primary">Plan funding</ActionButton></div></div>
        )}
        {doc("readiness") && <div className="space-y-2"><div className="eyebrow px-5 lg:px-0">Investor readiness</div><Checklist doc={doc("readiness")!} /></div>}
        {doc("data_room") && <div className="space-y-2"><div className="eyebrow px-5 lg:px-0">Data room</div><Checklist doc={doc("data_room")!} /></div>}
      </div>
      <div className="space-y-5">
        <RoundSim cap={cap} ventureId={id} />
        {doc("deck") && (
          <div className="card mx-5 p-4 lg:mx-0">
            <div className="flex items-center justify-between"><div className="text-[14px] font-medium">{doc("deck")!.title}</div><Link href={`/founder/v/${id}/deck`} className="chip"><Icon name="play" size={12} /> Present</Link></div>
            <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-[13px] text-muted">{doc("deck")!.slides.map((s, i) => <li key={i}>{s.title}</li>)}</ol>
          </div>
        )}
        {doc("investor_memo") && <DocCard doc={doc("investor_memo")!} />}
        {doc("investor_faq") && <DocCard doc={doc("investor_faq")!} />}
      </div>
    </div>
  );
}

function AddTask({ ventureId }: { ventureId: string }) {
  return (
    <details className="card mx-5 p-4 lg:mx-0">
      <summary className="cursor-pointer text-[14px] font-medium">Add a task</summary>
      <div className="mt-3"><AddTaskForm ventureId={ventureId} /></div>
    </details>
  );
}

function AddTaskForm({ ventureId }: { ventureId: string }) {
  return <CreateForm table="venture_tasks" extra={{ venture_id: ventureId, owner: "sean" }} fields={[{ name: "title", label: "Task" }, { name: "phase", label: "Phase", options: ["30", "60", "90", "later"] }, { name: "due", label: "Due", type: "date" }]} />;
}

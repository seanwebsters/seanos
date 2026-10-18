"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, useToast } from "@/components/client";
import { Icon } from "@/components/Icon";

export function AskWorld({ examples, context }: { examples: string[]; context?: { type: string; id: string; title: string } }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const ask = async (text: string) => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const { task } = await api<{ task: { id: string } }>("/api/tasks", { instruction: text, kind: "graph_ask", title: text.slice(0, 80), context_ref: context ?? null });
      toast({ text: "Reading your world…", href: `/tasks/${task.id}` });
      setQ("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="relative">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask your world anything…" className="field py-4 pr-14 text-[16px]" />
        <button disabled={busy || !q.trim()} className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-ink text-bg disabled:opacity-30" aria-label="Ask"><Icon name="arrow" size={18} /></button>
      </form>
      <div className="no-scrollbar mt-2.5 flex gap-2 overflow-x-auto">
        {examples.map((e) => <button key={e} onClick={() => ask(e)} disabled={busy} className="chip shrink-0">{e}</button>)}
      </div>
    </div>
  );
}

export function AmbitionForm() {
  const [statement, setStatement] = useState("");
  const [horizon, setHorizon] = useState("5 years");
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();
  return (
    <form className="space-y-2.5" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      try {
        const { ambition } = await api<{ ambition: { id: string } }>("/api/infinity/ambitions", { statement, horizon, why });
        toast({ text: "Your strategist is on it" });
        router.push(`/infinity/strategy/${ambition.id}`);
      } catch (err) {
        alert((err as Error).message);
        setBusy(false);
      }
    }}>
      <textarea value={statement} onChange={(e) => setStatement(e.target.value)} rows={3} placeholder="Here's where I want to be… e.g. A recognised leader in creative technology and AI entertainment, running my own studio." className="field font-serif text-[17px]" />
      <div className="flex gap-2">
        <select value={horizon} onChange={(e) => setHorizon(e.target.value)} className="field w-auto">{["1 year", "3 years", "5 years", "10 years"].map((h) => <option key={h}>{h}</option>)}</select>
        <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why it matters to you (optional)" className="field flex-1" />
      </div>
      <button disabled={busy || statement.trim().length < 8} className="btn-primary w-full py-3.5">{busy ? "Starting…" : <>Help me find the best path <Icon name="arrow" size={16} /></>}</button>
      <p className="text-[12px] text-muted">The strategist researches, decomposes and stress-tests a plan. Nothing starts until you approve it.</p>
    </form>
  );
}

export function NodeEditor({ id, name, summary, type, scope, aliases, types }: { id: string; name: string; summary: string; type: string; scope: string; aliases: string[]; types: string[] }) {
  const [v, setV] = useState({ name, summary, type, scope, aliases: aliases.join(", ") });
  const [merge, setMerge] = useState("");
  const router = useRouter();
  const toast = useToast();
  return (
    <div className="space-y-2">
      <input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} className="field" />
      <textarea value={v.summary} onChange={(e) => setV({ ...v, summary: e.target.value })} rows={3} className="field" placeholder="Summary" />
      <input value={v.aliases} onChange={(e) => setV({ ...v, aliases: e.target.value })} className="field" placeholder="Also known as (comma separated)" />
      <div className="flex gap-2">
        <select value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })} className="field">{types.map((t) => <option key={t}>{t}</option>)}</select>
        <select value={v.scope} onChange={(e) => setV({ ...v, scope: e.target.value })} className="field"><option value="public">public</option><option value="personal">personal</option><option value="work">work (Calm, private)</option></select>
      </div>
      <button className="btn-primary" onClick={async () => { await api(`/api/graph/node/${id}`, { ...v, aliases: v.aliases.split(",").map((x) => x.trim()).filter(Boolean) }, "PATCH"); toast({ text: "Corrected. Marked as yours." }); router.refresh(); }}>Save correction</button>
      <div className="flex gap-2 pt-2">
        <input value={merge} onChange={(e) => setMerge(e.target.value)} className="field flex-1" placeholder="Merge into node id (n_…)" />
        <button disabled={!merge} className="btn-ghost" onClick={async () => { const r = await api<{ into: string }>(`/api/graph/node/${id}`, { into: merge }); router.push(`/infinity/node/${r.into}`); }}>Merge</button>
      </div>
    </div>
  );
}

export function MetricsEditor({ id, metrics, counters }: { id: string; metrics: { name: string; target: number; current: number; unit: string; source: string }[]; counters: Record<string, string> }) {
  const [list, setList] = useState(metrics);
  const router = useRouter();
  const set = (i: number, k: string, val: string) => setList(list.map((m, j) => (j === i ? { ...m, [k]: ["target", "current"].includes(k) ? Number(val) : val } : m)));
  return (
    <div className="space-y-2">
      {list.map((m, i) => (
        <div key={i} className="grid grid-cols-[1fr_70px_70px] gap-1.5">
          <input value={m.name} onChange={(e) => set(i, "name", e.target.value)} className="field py-2 text-[13px]" />
          <input value={m.source === "manual" ? m.current : "auto"} disabled={m.source !== "manual"} onChange={(e) => set(i, "current", e.target.value)} className="field py-2 text-[13px]" aria-label="Current" />
          <input value={m.target} onChange={(e) => set(i, "target", e.target.value)} className="field py-2 text-[13px]" aria-label="Target" />
          <select value={m.source} onChange={(e) => set(i, "source", e.target.value)} className="col-span-3 rounded-xl bg-raised px-3 py-1.5 text-[12px] text-muted">
            <option value="manual">Tracked manually</option>
            {Object.entries(counters).map(([k, l]) => <option key={k} value={k}>Auto: {l}</option>)}
          </select>
        </div>
      ))}
      <div className="flex gap-2">
        <button className="chip" onClick={() => setList([...list, { name: "New metric", target: 1, current: 0, unit: "", source: "manual" }])}>Add metric</button>
        <button className="chip bg-ink text-bg" onClick={async () => { await api(`/api/infinity/strategy/${id}`, { action: "metrics", metrics: list }); router.refresh(); }}>Save metrics</button>
      </div>
    </div>
  );
}

export function EmergencyStop({ halted }: { halted: boolean }) {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        if (!halted && !confirm("Stop all agents now? Running tasks pause and no automation will fire until you resume.")) return;
        await api("/api/infinity/trust", { halted: !halted });
        router.refresh();
      }}
      className={halted ? "btn bg-sage text-[#141413]" : "btn bg-rose text-white"}
    >
      <Icon name={halted ? "play" : "pause"} size={16} /> {halted ? "Resume agents" : "Emergency stop"}
    </button>
  );
}

export function AutonomyPicker({ level }: { level: number }) {
  const router = useRouter();
  const L = [
    [1, "Observe", "Research, analyse and suggest. Nothing starts on its own."],
    [2, "Prepare", "Drafts, plans and recommendations. You start each approved action."],
    [3, "Execute internally", "Approving a strategy starts its internal actions automatically."],
    [4, "External with approval", "As 3. Every send, post, booking or payment still waits for you."],
    [5, "Pre-authorised", "Narrow, reversible operations within limits. None are configured yet, so this behaves like 4."],
  ] as const;
  return (
    <div className="space-y-2">
      {L.map(([n, title, body]) => (
        <button key={n} onClick={async () => { await api("/api/infinity/trust", { autonomy_level: n }); router.refresh(); }} className={`card flex w-full items-start gap-3 p-4 text-left ${level === n ? "ring-2 ring-accent" : ""}`}>
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold ${level === n ? "bg-accent text-[#141413]" : "bg-raised text-muted"}`}>{n}</span>
          <span><span className="block text-[15px] font-medium">{title}</span><span className="block text-[13px] text-muted">{body}</span></span>
        </button>
      ))}
    </div>
  );
}

export function DecisionForm() {
  const [q, setQ] = useState("");
  const [context, setContext] = useState("");
  const [options, setOptions] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <form className="space-y-2" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      try {
        const { decision } = await api<{ decision: { id: string } }>("/api/infinity/decisions", { question: q, context, options: options.split("\n").map((x) => x.trim()).filter(Boolean) });
        router.push(`/infinity/council/${decision.id}`);
      } catch (err) { alert((err as Error).message); setBusy(false); }
    }}>
      <textarea value={q} onChange={(e) => setQ(e.target.value)} rows={2} placeholder="e.g. Should I spend six months building VoysNote?" className="field font-serif text-[17px]" />
      <textarea value={context} onChange={(e) => setContext(e.target.value)} rows={2} placeholder="Context the council should know (optional)" className="field text-[14px]" />
      <textarea value={options} onChange={(e) => setOptions(e.target.value)} rows={2} placeholder="Options, one per line (optional; the council will frame them)" className="field text-[14px]" />
      <button disabled={busy || q.trim().length < 8} className="btn-primary w-full py-3.5">{busy ? "Convening…" : "Convene the council"}</button>
    </form>
  );
}

export function ScenarioForm({ examples }: { examples: string[] }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const go = async (text: string) => {
    setBusy(true);
    try {
      const { task } = await api<{ task: { id: string } }>("/api/infinity/scenarios", { question: text });
      toast({ text: "Modelling the futures…", href: `/tasks/${task.id}` });
      setQ("");
      router.refresh();
    } catch (err) { alert((err as Error).message); } finally { setBusy(false); }
  };
  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); go(q); }} className="relative">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="What happens if I…" className="field py-4 pr-14 text-[16px]" />
        <button disabled={busy || q.trim().length < 8} className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-ink text-bg disabled:opacity-30" aria-label="Model"><Icon name="arrow" size={18} /></button>
      </form>
      <div className="no-scrollbar mt-2.5 flex gap-2 overflow-x-auto">{examples.map((e) => <button key={e} disabled={busy} onClick={() => go(e)} className="chip shrink-0">{e}</button>)}</div>
    </div>
  );
}

export function DecideForm({ id, options, recommended }: { id: string; options: string[]; recommended: string | null }) {
  const [choice, setChoice] = useState(recommended ?? options[0] ?? "");
  const [note, setNote] = useState("");
  const router = useRouter();
  const toast = useToast();
  return (
    <div className="space-y-2">
      {options.map((o) => (
        <label key={o} className={`flex cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-[14.5px] ring-1 ${choice === o ? "bg-accent/10 ring-accent" : "bg-raised ring-transparent"}`}>
          <input type="radio" checked={choice === o} onChange={() => setChoice(o)} className="accent-[rgb(var(--accent))]" />
          <span className="flex-1">{o}</span>{o === recommended && <span className="text-[11px] font-semibold text-accent">Council's pick</span>}
        </label>
      ))}
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={choice !== recommended ? "Why? (helps your strategic twin learn)" : "Any reasoning to remember (optional)"} className="field" />
      <button disabled={!choice} className="btn-primary" onClick={async () => { await api(`/api/infinity/decisions/${id}`, { action: "decide", option: choice, note }); toast({ text: "Decision recorded" }); router.refresh(); }}>Record my decision</button>
      <p className="text-[12px] text-muted">Your decision is yours. Recording it teaches SEAN ∞ how you weigh things; it doesn't trigger any action.</p>
    </div>
  );
}

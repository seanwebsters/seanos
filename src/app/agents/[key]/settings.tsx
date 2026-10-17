"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, useToast } from "@/components/client";

export function AgentSettings(p: { agentKey: string; defaults: string; instructions: string | null; model: string | null; enabled: boolean; models: string[]; defaultModel: string }) {
  const [text, setText] = useState(p.instructions ?? p.defaults);
  const [model, setModel] = useState(p.model ?? "");
  const [enabled, setEnabled] = useState(p.enabled);
  const router = useRouter();
  const toast = useToast();
  const save = async () => {
    await api(`/api/entity/agent_overrides/${p.agentKey}`, { instructions: text === p.defaults ? null : text, model: model || null, enabled }, "PATCH");
    toast({ text: "Saved" });
    router.refresh();
  };
  return (
    <div className="mx-5 space-y-3 lg:mx-0">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} className="field text-[14px] leading-relaxed" />
      <div className="flex flex-wrap items-center gap-3">
        <select value={model} onChange={(e) => setModel(e.target.value)} className="field w-auto">
          <option value="">Default ({p.defaultModel})</option>
          {p.models.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--accent))]" /> Enabled</label>
        <button onClick={save} className="btn-primary">Save</button>
        {text !== p.defaults && <button onClick={() => setText(p.defaults)} className="btn-ghost">Reset</button>}
      </div>
      <p className="text-[12px] text-muted">House rules on truthfulness, sources, privacy and approvals always apply on top of these instructions.</p>
    </div>
  );
}

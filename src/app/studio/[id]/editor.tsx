"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Draft } from "@/lib/db/types";
import { api, CopyButton, Delegate, Feedback, useToast } from "@/components/client";
import { Icon } from "@/components/Icon";

export function DraftEditor({ draft, approvalId }: { draft: Draft; approvalId: string | null }) {
  const [body, setBody] = useState(draft.body);
  const [title, setTitle] = useState(draft.title);
  const [when, setWhen] = useState(draft.scheduled_for?.slice(0, 16) ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const dirty = body !== draft.body || title !== draft.title;

  const save = async (extra: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      await api(`/api/entity/drafts/${draft.id}`, { body, title, ...extra }, "PATCH");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };
  const decide = async (decision: "approved" | "rejected") => {
    if (dirty) await save();
    if (approvalId) await api(`/api/approvals/${approvalId}`, { decision, note });
    else await api(`/api/entity/drafts/${draft.id}`, { status: decision }, "PATCH");
    toast({ text: decision === "approved" ? "Approved. Copy it when you're ready to post." : "Rejected. The team will learn from it." });
    router.refresh();
  };
  const download = () => {
    const md = `# ${title}\n\n${body}${draft.slides.length ? `\n\n---\n${draft.slides.map((s, i) => `## ${i + 1}. ${s.title}\n${s.body}`).join("\n\n")}` : ""}`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    a.download = `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`;
    a.click();
  };
  const ctx = { type: "draft", id: draft.id, title: draft.title };

  return (
    <div className="mx-5 lg:mx-0">
      <input value={title} onChange={(e) => setTitle(e.target.value)} className="field mt-2 font-medium" aria-label="Title" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={16} className="field mt-3 font-serif text-[17px] leading-relaxed" aria-label="Draft" />
      <div className="mt-1 text-right text-[12px] text-faint">{body.length} characters</div>
      {draft.slides.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="eyebrow">Slides / beats</div>
          {draft.slides.map((s, i) => (
            <div key={i} className="card p-4"><div className="text-[12px] text-muted">{i + 1}</div><div className="font-semibold">{s.title}</div><div className="mt-1 text-[14px] text-ink/80">{s.body}</div></div>
          ))}
        </div>
      )}
      {draft.notes && <div className="mt-4 rounded-2xl bg-raised p-4 text-[13.5px] text-muted"><span className="font-medium text-ink">Why this angle: </span>{draft.notes}</div>}
      <div className="mt-5 flex flex-wrap gap-2">
        {dirty && <button disabled={busy} onClick={() => save()} className="btn-primary">Save edits</button>}
        {draft.status !== "approved" && draft.status !== "scheduled" && <button onClick={() => decide("approved")} className="btn-accent"><Icon name="check" size={16} /> Approve</button>}
        <CopyButton text={body} className="btn-ghost" label="Copy text" />
        <button onClick={download} className="btn-ghost"><Icon name="upload" size={16} /> Export .md</button>
      </div>
      <div className="mt-6 card p-4">
        <div className="eyebrow mb-2">Schedule</div>
        <div className="flex gap-2">
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="field flex-1" />
          <button className="btn-ghost" disabled={!when} onClick={() => save({ scheduled_for: new Date(when).toISOString(), status: "scheduled" })}>Set</button>
        </div>
        <p className="mt-2 text-[12px] text-muted">SEAN OS never posts for you. You'll get a reminder at this time.</p>
      </div>
      <div className="mt-6">
        <div className="eyebrow mb-2">Rework</div>
        <div className="flex flex-wrap gap-2">
          <Delegate label="Make it more playful" kind="content_draft" instruction="Rewrite this draft to be more playful, keeping the point." context={ctx} />
          <Delegate label="Shorter" kind="content_draft" instruction="Rewrite this draft at half the length." context={ctx} />
          <Delegate label="Turn into a carousel" kind="content_draft" instruction="Turn this into an Instagram carousel with 6-8 slides." context={ctx} />
          <Delegate label="Version for X" kind="content_draft" instruction="Adapt this into a post or short thread for X." context={ctx} />
        </div>
      </div>
      <div className="mt-6">
        <div className="eyebrow mb-2">Teach the team</div>
        <Feedback target="draft" id={draft.id} title={draft.title} options={[{ signal: "style", label: "Exactly my style", icon: "heart" }, { signal: "corporate", label: "Too corporate", icon: "thumbsdown" }, { signal: "more", label: "More like this" }]} />
      </div>
      {draft.status !== "rejected" && (
        <div className="mt-8 border-t border-line pt-5">
          <div className="eyebrow mb-2">Reject</div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What's wrong with it? (teaches the team)" className="field" />
          <button onClick={() => decide("rejected")} className="btn-line mt-2 text-rose">Reject draft</button>
        </div>
      )}
    </div>
  );
}

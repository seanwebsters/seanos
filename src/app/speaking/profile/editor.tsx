"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SpeakerProfile } from "@/lib/db/types";
import { api, useToast } from "@/components/client";

export function SpeakerEditor({ speaker }: { speaker: SpeakerProfile }) {
  const [ach, setAch] = useState(speaker.achievements.join("\n"));
  const [talks, setTalks] = useState(speaker.past_talks.join("\n"));
  const [exp, setExp] = useState(speaker.expertise.join(", "));
  const [topics, setTopics] = useState(speaker.topics.map((t) => t.title).join("\n"));
  const router = useRouter();
  const toast = useToast();
  const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
  const save = async () => {
    const titles = lines(topics);
    await api("/api/entity/profile/me", { speaker: { ...speaker, achievements: lines(ach), past_talks: lines(talks), expertise: exp.split(",").map((x) => x.trim()).filter(Boolean), topics: titles.map((t) => speaker.topics.find((x) => x.title === t) ?? { title: t, description: "" }) } }, "PATCH");
    toast({ text: "Speaker profile saved" });
    router.refresh();
  };
  return (
    <div className="mx-5 space-y-3 lg:mx-0">
      <label className="block text-[13px] text-muted">Achievements (one per line, verified)<textarea rows={4} value={ach} onChange={(e) => setAch(e.target.value)} className="field mt-1" /></label>
      <label className="block text-[13px] text-muted">Past talks (leave empty if none)<textarea rows={2} value={talks} onChange={(e) => setTalks(e.target.value)} className="field mt-1" /></label>
      <label className="block text-[13px] text-muted">Expertise<input value={exp} onChange={(e) => setExp(e.target.value)} className="field mt-1" /></label>
      <label className="block text-[13px] text-muted">Talk titles (one per line)<textarea rows={4} value={topics} onChange={(e) => setTopics(e.target.value)} className="field mt-1" /></label>
      <button onClick={save} className="btn-primary">Save</button>
    </div>
  );
}

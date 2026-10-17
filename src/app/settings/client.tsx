"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, useToast } from "@/components/client";

export function Budgets({ daily, monthly, model, fast, models }: { daily: number; monthly: number; model: string; fast: string; models: string[] }) {
  const [d, setD] = useState(String(daily / 100));
  const [m, setM] = useState(String(monthly / 100));
  const [mod, setMod] = useState(model);
  const [f, setF] = useState(fast);
  const router = useRouter();
  const toast = useToast();
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[13px] text-muted">Daily cap $<input value={d} onChange={(e) => setD(e.target.value)} inputMode="decimal" className="field mt-1" /></label>
        <label className="text-[13px] text-muted">Monthly cap $<input value={m} onChange={(e) => setM(e.target.value)} inputMode="decimal" className="field mt-1" /></label>
      </div>
      <label className="block text-[13px] text-muted">Main model<select value={mod} onChange={(e) => setMod(e.target.value)} className="field mt-1">{models.map((x) => <option key={x}>{x}</option>)}</select></label>
      <label className="block text-[13px] text-muted">Fast model (stylist, tagging)<select value={f} onChange={(e) => setF(e.target.value)} className="field mt-1">{models.map((x) => <option key={x}>{x}</option>)}</select></label>
      <button className="btn-primary" onClick={async () => {
        await api("/api/entity/settings/app", { daily_budget_cents: Math.round(Number(d) * 100), monthly_budget_cents: Math.round(Number(m) * 100), default_model: mod, fast_model: f }, "PATCH");
        toast({ text: "Saved" });
        router.refresh();
      }}>Save</button>
      <p className="text-[12px] text-muted">When a cap is reached, tasks pause as “blocked” instead of overspending.</p>
    </div>
  );
}

const b64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));

export function PushSetup({ threshold, configured }: { threshold: number; configured: boolean }) {
  const [t, setT] = useState(threshold);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  const enable = async () => {
    try {
      const { publicKey } = await api<{ publicKey: string | null }>("/api/push", undefined, "GET");
      if (!publicKey) return setMsg("Push isn't configured on the server yet.");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setMsg("Notifications were not allowed.");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(publicKey) });
      await api("/api/push", { subscription: sub.toJSON() });
      setMsg("This device will get notifications.");
      router.refresh();
    } catch (e) {
      setMsg(`Couldn't enable: ${(e as Error).message}. On iPhone, add SEAN OS to your Home Screen first.`);
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex rounded-full bg-raised p-1">
        {[[1, "Everything"], [2, "Important"], [3, "Urgent only"]].map(([v, l]) => (
          <button key={v} onClick={async () => { setT(v as 1); await api("/api/entity/settings/app", { notify_threshold: v }, "PATCH"); router.refresh(); }} className={`flex-1 rounded-full px-3 py-1.5 text-[13px] ${t === v ? "bg-surface font-medium shadow ring-1 ring-line" : "text-muted"}`}>{l}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={enable} disabled={!configured} className="btn-ghost">Enable on this device</button>
        <button onClick={async () => { const r = await api<{ sent: number }>("/api/push", { action: "test" }); setMsg(`Sent to ${r.sent} device(s).`); }} disabled={!configured} className="btn-ghost">Send test</button>
      </div>
      {msg && <div className="text-[13px] text-muted">{msg}</div>}
    </div>
  );
}

export function Coverage({ coverage }: { coverage: Record<string, number> }) {
  const [c, setC] = useState(coverage);
  const router = useRouter();
  const set = async (k: string, v: number) => {
    const next = { ...c, [k]: v };
    setC(next);
    await api("/api/entity/settings/app", { coverage: next }, "PATCH");
    router.refresh();
  };
  return (
    <div className="space-y-2">
      {Object.entries(c).map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-3">
          <span className="text-[14px]">{k}</span>
          <div className="flex rounded-full bg-raised p-0.5">
            {[[0, "Off"], [1, "Normal"], [2, "More"]].map(([n, l]) => <button key={n} onClick={() => set(k, n as number)} className={`rounded-full px-2.5 py-1 text-[12px] ${v === n ? "bg-surface font-medium shadow ring-1 ring-line" : "text-muted"}`}>{l}</button>)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SignOut() {
  return <button className="btn-line w-full" onClick={async () => { await api("/api/auth/sign-out", {}); location.href = "/sign-in"; }}>Sign out</button>;
}

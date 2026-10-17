"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api, useToast } from "@/components/client";
import { CATEGORIES } from "@/lib/finance";
import { Icon } from "@/components/Icon";

export function CsvImport({ accounts }: { accounts: { id: string; name: string }[] }) {
  const ref = useRef<HTMLInputElement>(null);
  const [account, setAccount] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();
  return (
    <div className="space-y-2">
      {accounts.length > 0 && (
        <select value={account} onChange={(e) => setAccount(e.target.value)} className="field py-2.5 text-[14px]">
          <option value="">No account</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      )}
      <input ref={ref} type="file" accept=".csv,text/csv" className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setBusy(true);
        setMsg(null);
        try {
          const r = await api<{ added: number; dupes: number; skipped: number; uncategorised: number; task: unknown }>("/api/finance/import", { csv: await f.text(), account_id: account || null });
          setMsg(`${r.added} added${r.dupes ? `, ${r.dupes} duplicates skipped` : ""}${r.skipped ? `, ${r.skipped} unreadable rows` : ""}.${r.uncategorised ? r.task ? ` Your planner is categorising ${r.uncategorised}.` : ` ${r.uncategorised} need a category.` : ""}`);
          toast({ text: `Imported ${r.added} transactions` });
          router.refresh();
        } catch (err) {
          setMsg((err as Error).message);
        } finally {
          setBusy(false);
          e.target.value = "";
        }
      }} />
      <button onClick={() => ref.current?.click()} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line py-4 text-[14px] text-muted active:scale-[0.99]">
        <Icon name="upload" size={17} /> {busy ? "Importing…" : "Choose a CSV export"}
      </button>
      {msg && <div className="text-[12.5px] text-muted">{msg}</div>}
      <p className="text-[11.5px] text-faint">In your banking app, look for Export or Statements → CSV. Re-importing the same file won't duplicate anything.</p>
    </div>
  );
}

export function CategorySelect({ id, value }: { id: string; value: string }) {
  const router = useRouter();
  return (
    <select defaultValue={value} onChange={async (e) => { await api(`/api/entity/transactions/${id}`, { category: e.target.value }, "PATCH"); router.refresh(); }} className="-ml-1 rounded-md bg-transparent px-1 text-[12px] text-muted">
      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
    </select>
  );
}

export function TxnFilter({ q, cat, month, categories, months }: { q: string; cat: string; month: string; categories: string[]; months: string[] }) {
  return (
    <form className="flex flex-wrap gap-2">
      <input type="hidden" name="tab" value="transactions" />
      <input name="q" defaultValue={q} placeholder="Search" className="field min-w-[140px] flex-1 py-2.5 text-[14px]" />
      <select name="cat" defaultValue={cat} onChange={(e) => e.target.form?.requestSubmit()} className="field w-auto py-2.5 text-[14px]"><option value="">All categories</option>{categories.map((c) => <option key={c}>{c}</option>)}</select>
      <select name="month" defaultValue={month} onChange={(e) => e.target.form?.requestSubmit()} className="field w-auto py-2.5 text-[14px]"><option value="">All months</option>{months.map((m) => <option key={m}>{m}</option>)}</select>
    </form>
  );
}

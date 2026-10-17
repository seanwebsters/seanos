"use client";
import { useState } from "react";
import { api } from "@/components/client";

export function SignInForm() {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form className="mt-6 space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      setErr(null);
      try {
        await api("/api/auth/sign-in", { code });
        const next = new URLSearchParams(location.search).get("next");
        location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
      } catch (e) {
        setErr((e as Error).message);
        setBusy(false);
      }
    }}>
      <input type="password" autoFocus autoComplete="current-password" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Passcode" className="field py-4 text-[17px]" />
      {err && <div className="text-[13px] text-rose">{err}</div>}
      <button disabled={busy || !code} className="btn-primary w-full py-4 text-[16px]">{busy ? "Signing in…" : "Enter"}</button>
    </form>
  );
}

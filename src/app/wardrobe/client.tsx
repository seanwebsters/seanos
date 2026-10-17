"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { Profile } from "@/lib/db/types";
import { api, useToast } from "@/components/client";
import { Icon } from "@/components/Icon";

/** Resizes on-device before upload so photos stay small. */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.85));
}

export function Upload() {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const router = useRouter();
  const toast = useToast();
  return (
    <>
      <input ref={ref} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={async (e) => {
        const files = Array.from(e.target.files ?? []);
        setBusy(files.length);
        let tagged = false;
        for (const f of files) {
          const fd = new FormData();
          fd.append("file", new File([await shrink(f)], "photo.jpg", { type: "image/jpeg" }));
          const res = await fetch("/api/upload", { method: "POST", body: fd });
          const j = await res.json();
          if (j.task) tagged = true;
          setBusy((n) => n - 1);
        }
        toast({ text: tagged ? "Added. Your stylist is cataloguing them." : "Added to your closet" });
        router.refresh();
        e.target.value = "";
      }} />
      <button onClick={() => ref.current?.click()} disabled={busy > 0} className="flex w-full items-center justify-center gap-2 rounded-card border border-dashed border-line py-6 text-[14.5px] text-muted active:scale-[0.99]">
        <Icon name="upload" size={18} /> {busy ? `Uploading ${busy}…` : "Add photos of your clothes"}
      </button>
    </>
  );
}

export function StyleProfile({ style }: { style: Profile["style"] }) {
  const [s, setS] = useState({ ...style, brands: style.brands.join(", "), colours: style.colours.join(", ") });
  const router = useRouter();
  const toast = useToast();
  const f = (k: keyof typeof s, label: string) => (
    <label className="block text-[13px] text-muted">{label}<input value={s[k] as string} onChange={(e) => setS({ ...s, [k]: e.target.value })} className="field mt-1" /></label>
  );
  return (
    <div className="space-y-2.5">
      {f("sizes", "Sizes (e.g. M tops, 32 waist, UK 9)")}
      {f("brands", "Brands you love")}
      {f("colours", "Colours you wear")}
      {f("silhouettes", "Silhouettes / fit")}
      {f("budget", "Budget")}
      {f("inspirations", "Style inspirations")}
      <button className="btn-primary" onClick={async () => {
        await api("/api/entity/profile/me", { style: { ...s, brands: s.brands.split(",").map((x) => x.trim()).filter(Boolean), colours: s.colours.split(",").map((x) => x.trim()).filter(Boolean) } }, "PATCH");
        toast({ text: "Style profile saved" });
        router.refresh();
      }}>Save</button>
    </div>
  );
}

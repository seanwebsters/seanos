"use client";
import { useRouter } from "next/navigation";
import { api } from "@/components/client";
import { WEEKDAYS } from "@/lib/engine/schedule";

export function AutomationTime({ id, hour, minute, weekday, cadence }: { id: string; hour: number; minute: number; weekday: number | null; cadence: string }) {
  const router = useRouter();
  const save = async (patch: Record<string, unknown>) => {
    await api(`/api/entity/automations/${id}`, patch, "PATCH");
    await api(`/api/automations/reschedule`, { id });
    router.refresh();
  };
  return (
    <div className="flex items-center gap-1.5">
      {cadence === "weekly" && (
        <select defaultValue={weekday ?? 1} onChange={(e) => save({ weekday: Number(e.target.value) })} className="rounded-full bg-raised px-3 py-1.5 text-[12.5px]">
          {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d.slice(0, 3)}</option>)}
        </select>
      )}
      <input type="time" defaultValue={`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`} onBlur={(e) => { const [h, m] = e.target.value.split(":").map(Number); if (!Number.isNaN(h)) save({ hour: h, minute: m }); }} className="rounded-full bg-raised px-3 py-1.5 text-[12.5px]" />
    </div>
  );
}

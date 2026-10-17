"use client";
import { useRouter } from "next/navigation";
import { api } from "@/components/client";

export function MarkAllRead({ ids }: { ids: string[] }) {
  const router = useRouter();
  return <button className="chip" onClick={async () => { await Promise.all(ids.map((id) => api(`/api/entity/notifications/${id}`, { read: true }, "PATCH"))); router.refresh(); }}>Mark all read</button>;
}

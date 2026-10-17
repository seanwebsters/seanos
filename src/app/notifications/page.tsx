import Link from "next/link";
import { getDb } from "@/lib/db";
import { ensureBootstrapped } from "@/lib/bootstrap";
import { relTime } from "@/lib/time";
import { Empty, PageHeader } from "@/components/ui";
import { MarkAllRead } from "./mark";

export const dynamic = "force-dynamic";

export default async function Notifications() {
  await ensureBootstrapped();
  const db = getDb();
  const list = await db.list("notifications", { orderBy: { column: "created_at", ascending: false }, limit: 80 });
  const unread = list.filter((n) => !n.read).map((n) => n.id);
  return (
    <div>
      <PageHeader back="/" title="Notifications" actions={unread.length ? <MarkAllRead ids={unread} /> : null} />
      {list.length ? (
        <div className="mx-5 mt-3 space-y-2 lg:mx-0">
          {list.map((n) => (
            <Link key={n.id} href={n.href ?? "#"} className={`card block p-4 ${n.read ? "opacity-70" : ""}`}>
              <div className="flex items-center gap-2">
                {!n.read && <span className="h-2 w-2 rounded-full bg-accent" />}
                <div className="flex-1 truncate text-[14.5px] font-semibold">{n.title}</div>
                <span className="text-[11.5px] text-faint">{relTime(n.created_at)}</span>
              </div>
              <div className="mt-1 line-clamp-2 text-[13.5px] text-muted">{n.body}</div>
            </Link>
          ))}
        </div>
      ) : <div className="mt-4"><Empty icon="bell" title="No notifications" body="You'll hear from your team when something is ready, blocked or worth your attention, filtered by your threshold in Settings." /></div>}
    </div>
  );
}

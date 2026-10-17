/**
 * Background worker for single-server hosting (Railway, Fly, a VPS, local).
 * On serverless hosts, call /api/cron/tick from a scheduler instead.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.DISABLE_WORKER === "1" || process.env.NEXT_PHASE === "phase-production-build") return;
  const g = globalThis as unknown as { __seanHeartbeat?: NodeJS.Timeout };
  if (g.__seanHeartbeat) return;
  const beat = async () => {
    try {
      const { heartbeat } = await import("@/lib/engine");
      await heartbeat();
    } catch (err) {
      console.error(JSON.stringify({ level: "error", scope: "heartbeat", message: String(err) }));
    }
  };
  g.__seanHeartbeat = setInterval(beat, 30_000);
  setTimeout(beat, 4_000);
}

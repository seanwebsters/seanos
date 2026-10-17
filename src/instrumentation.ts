/**
 * Background worker for single-server hosting (Railway, Fly, a VPS, local).
 * On serverless hosts, call /api/cron/tick from a scheduler instead.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}

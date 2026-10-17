const g = globalThis as unknown as { __seanHeartbeat?: NodeJS.Timeout };

if (process.env.DISABLE_WORKER !== "1" && process.env.NEXT_PHASE !== "phase-production-build" && !g.__seanHeartbeat) {
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

export {};

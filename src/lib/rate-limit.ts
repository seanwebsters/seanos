import "server-only";
import { HttpError } from "@/lib/api";

const buckets = new Map<string, number[]>();

/** Sliding-window limiter for expensive endpoints (per key, per process). */
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const list = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) throw new HttpError(429, "Slow down a little: too many requests. Try again in a minute.");
  list.push(now);
  buckets.set(key, list);
}

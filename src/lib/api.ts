import "server-only";
import { NextResponse } from "next/server";
import { ensureBootstrapped } from "@/lib/bootstrap";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Wraps a route handler: bootstraps data and turns errors into JSON. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      await ensureBootstrapped();
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(JSON.stringify({ level: "error", scope: "api", message: String(e) }));
      return json({ error: e instanceof Error ? e.message : "Something went wrong" }, 500);
    }
  };
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

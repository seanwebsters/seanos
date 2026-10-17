import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { body, json, route } from "@/lib/api";
import { SESSION_COOKIE, SESSION_DAYS, sessionSecret, signSession } from "@/lib/auth-token";

const attempts = new Map<string, { n: number; at: number }>();

export const POST = route(async (req: Request) => {
  const passcode = process.env.OWNER_PASSCODE;
  if (!passcode) return json({ error: "Set OWNER_PASSCODE on the server to enable sign-in." }, 400);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  const a = attempts.get(ip);
  if (a && a.n >= 8 && Date.now() - a.at < 15 * 60_000) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
  const { code } = await body<{ code: string }>(req);
  const ok = typeof code === "string" && code.length === passcode.length && timingSafeEqual(Buffer.from(code), Buffer.from(passcode));
  if (!ok) {
    attempts.set(ip, { n: (a?.n ?? 0) + 1, at: Date.now() });
    return json({ error: "That passcode isn't right." }, 401);
  }
  attempts.delete(ip);
  (await cookies()).set(SESSION_COOKIE, await signSession(sessionSecret()), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86400 });
  return json({ ok: true });
});

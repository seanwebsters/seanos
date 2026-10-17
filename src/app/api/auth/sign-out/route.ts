import { cookies } from "next/headers";
import { json, route } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/auth-token";

export const POST = route(async () => {
  (await cookies()).delete(SESSION_COOKIE);
  return json({ ok: true });
});

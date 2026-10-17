import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionSecret, verifySession } from "@/lib/auth-token";

const PUBLIC = [/^\/sign-in/, /^\/api\/auth\//, /^\/api\/cron\//, /^\/manifest\.webmanifest$/, /^\/sw\.js$/, /^\/icons\//, /^\/offline$/, /^\/favicon/];

/**
 * Single-owner access. Every page and API route requires Sean's session,
 * except sign-in, static PWA files and the secret-protected cron endpoint.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  const passcode = process.env.OWNER_PASSCODE;
  if (!passcode && process.env.NODE_ENV !== "production") return NextResponse.next();
  const ok = passcode ? await verifySession(sessionSecret(), req.cookies.get(SESSION_COOKIE)?.value) : false;
  if (ok) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/sign-in";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionSecret, verifySession } from "@/lib/auth-token";

const PUBLIC = [/^\/sign-in/, /^\/api\/auth\//, /^\/api\/cron\//, /^\/manifest\.webmanifest$/, /^\/sw\.js$/, /^\/icons\//, /^\/offline$/, /^\/favicon/];

/**
 * Optional single-owner lock. With no OWNER_PASSCODE set the app is open,
 * with no sign-in. Set OWNER_PASSCODE to require it again on every page and
 * API route (except static PWA files and the secret-protected cron endpoint).
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  const passcode = process.env.OWNER_PASSCODE;
  if (!passcode) return NextResponse.next();
  const ok = await verifySession(sessionSecret(), req.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/sign-in";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };

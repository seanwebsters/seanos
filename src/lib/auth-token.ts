/** Signed session tokens using Web Crypto (works in middleware and Node). */
const enc = new TextEncoder();

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const SESSION_COOKIE = "sos_session";
export const SESSION_DAYS = 365;

export async function signSession(secret: string, now = Date.now()) {
  const exp = String(now + SESSION_DAYS * 86400000);
  return `${exp}.${await hmac(secret, `owner:${exp}`)}`;
}

export async function verifySession(secret: string, token: string | undefined, now = Date.now()) {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < now) return false;
  const expected = await hmac(secret, `owner:${exp}`);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

export function sessionSecret() {
  return process.env.SESSION_SECRET || process.env.OWNER_PASSCODE || "dev-only-session-secret";
}

import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../db";
import { sessions, users } from "../db/schema";

export const SESSION_COOKIE = "lifequest_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;

const bytesToHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
export const randomToken = (bytes = 32) => { const value = new Uint8Array(bytes); crypto.getRandomValues(value); return bytesToHex(value); };
export async function sha256(value: string) { return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))); }
export async function otpHash(destination: string, code: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_NOT_CONFIGURED");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${destination}:${code}`))));
}

export function getCookie(request: Request, name: string) {
  const entry = request.headers.get("cookie")?.split(";").map((v) => v.trim()).find((v) => v.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
}
export function sessionCookie(token: string, maxAge = SESSION_SECONDS) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
export function clearSessionCookie() { const secure = process.env.NODE_ENV === "production" ? "; Secure" : ""; return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`; }

export async function createSession(userId: string) {
  const token = randomToken(); const now = Date.now(); const db = await getDb();
  await db.insert(sessions).values({ id: crypto.randomUUID(), userId, tokenHash: await sha256(token), createdAt: now, expiresAt: now + SESSION_SECONDS * 1000 });
  return token;
}
export async function currentUser(request: Request) {
  const token = getCookie(request, SESSION_COOKIE); if (!token) return null;
  const db = await getDb();
  const [row] = await db.select({ id: users.id, name: users.name, channel: users.channel, destination: users.destination })
    .from(sessions).innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, await sha256(token)), gt(sessions.expiresAt, Date.now()))).limit(1);
  return row ?? null;
}

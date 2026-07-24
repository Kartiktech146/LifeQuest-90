import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { sessions } from "../../../../db/schema";
import { clearSessionCookie, getCookie, SESSION_COOKIE, sha256 } from "../../../../lib/auth";
export async function POST(request: Request) {
  const token = getCookie(request, SESSION_COOKIE); if (token) { const db = await getDb(); await db.delete(sessions).where(eq(sessions.tokenHash, await sha256(token))); }
  return Response.json({ loggedOut: true }, { headers: { "set-cookie": clearSessionCookie() } });
}

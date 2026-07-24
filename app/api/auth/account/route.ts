import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { sessions, users, userStates } from "../../../../db/schema";
import { clearSessionCookie, currentUser } from "../../../../lib/auth";
export async function DELETE(request: Request) {
  const user = await currentUser(request); if (!user) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { confirmation?: string };
  if (body.confirmation !== "DELETE") return Response.json({ error: "CONFIRMATION_REQUIRED" }, { status: 400 });
  const db = await getDb(); await db.delete(userStates).where(eq(userStates.userKey, user.id)); await db.delete(sessions).where(eq(sessions.userId, user.id)); await db.delete(users).where(eq(users.id, user.id));
  return Response.json({ deleted: true }, { headers: { "set-cookie": clearSessionCookie() } });
}

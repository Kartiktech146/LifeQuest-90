import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../../../../db";
import { otpChallenges, users } from "../../../../db/schema";
import { createSession, otpHash, sessionCookie } from "../../../../lib/auth";

export async function POST(request: Request) {
  try {
    const { challengeId, code, name } = await request.json() as { challengeId?: string; code?: string; name?: string };
    if (!challengeId || !/^\d{6}$/.test(code || "")) return Response.json({ error: "INVALID_OTP" }, { status: 400 });
    const db = await getDb();
    const [challenge] = await db.select().from(otpChallenges).where(and(eq(otpChallenges.id, challengeId), isNull(otpChallenges.consumedAt))).limit(1);
    if (!challenge || challenge.expiresAt < Date.now() || challenge.attempts >= 5) return Response.json({ error: "OTP_EXPIRED" }, { status: 400 });
    await db.update(otpChallenges).set({ attempts: challenge.attempts + 1 }).where(eq(otpChallenges.id, challenge.id));
    if (challenge.codeHash !== await otpHash(challenge.destination, code!)) return Response.json({ error: "INVALID_OTP" }, { status: 401 });
    await db.update(otpChallenges).set({ consumedAt: Date.now() }).where(eq(otpChallenges.id, challenge.id));
    let [user] = await db.select().from(users).where(eq(users.destination, challenge.destination)).limit(1);
    if (!user) { user = { id: crypto.randomUUID(), name: name?.trim().slice(0, 60) || "Player", channel: challenge.channel, destination: challenge.destination, createdAt: new Date().toISOString() }; await db.insert(users).values(user); }
    const token = await createSession(user.id);
    return Response.json({ user: { id: user.id, name: user.name, method: user.channel === "email" ? "google" : "mobile", label: user.destination, createdAt: user.createdAt } }, { headers: { "set-cookie": sessionCookie(token) } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "VERIFY_FAILED" }, { status: 500 }); }
}

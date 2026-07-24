import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../../../../db";
import { otpChallenges } from "../../../../db/schema";
import { otpHash } from "../../../../lib/auth";
import { sendGmailOtp } from "../../../../lib/providers/gmail";
import { sendSmsOtp } from "../../../../lib/providers/sms";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { channel?: "email" | "sms"; destination?: string };
    const channel = body.channel, raw = body.destination?.trim() || "";
    const destination = channel === "email" ? raw.toLowerCase() : raw.replace(/\s/g, "");
    if (channel === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(destination)) return Response.json({ error: "INVALID_EMAIL" }, { status: 400 });
    if (channel === "sms" && !/^\+[1-9]\d{7,14}$/.test(destination)) return Response.json({ error: "INVALID_PHONE" }, { status: 400 });
    if (!channel) return Response.json({ error: "INVALID_CHANNEL" }, { status: 400 });
    const db = await getDb(); const recent = Date.now() - 60_000;
    const [existing] = await db.select({ id: otpChallenges.id }).from(otpChallenges).where(and(eq(otpChallenges.destination, destination), gt(otpChallenges.createdAt, recent))).limit(1);
    if (existing) return Response.json({ error: "OTP_RATE_LIMIT" }, { status: 429 });
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    const challengeId = crypto.randomUUID();
    if (channel === "email") await sendGmailOtp(destination, code); else await sendSmsOtp(destination, code);
    // Store the challenge only after delivery succeeds. A provider/configuration
    // failure must not lock the user behind the one-minute OTP rate limit.
    await db.insert(otpChallenges).values({ id: challengeId, channel, destination, codeHash: await otpHash(destination, code), createdAt: Date.now(), expiresAt: Date.now() + 600_000 });
    return Response.json({ challengeId, expiresIn: 600 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "OTP_REQUEST_FAILED";
    return Response.json({ error: message }, { status: message.endsWith("NOT_CONFIGURED") ? 503 : 500 });
  }
}

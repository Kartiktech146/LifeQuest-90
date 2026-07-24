import { eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { userStates } from "../../../db/schema";
import { currentUser } from "../../../lib/auth";

async function userKey(request: Request) {
  const user = await currentUser(request);
  return user?.id ?? request.headers.get("oai-authenticated-user-email");
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected persistence error";
  return Response.json({ error: message }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const key = await userKey(request);
    if (!key) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
    const db = await getDb();
    const [record] = await db.select({ payload: userStates.payload }).from(userStates).where(eq(userStates.userKey, key)).limit(1);
    return Response.json({ state: record ? JSON.parse(record.payload) : null });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as { state?: unknown };
    if (!body.state || typeof body.state !== "object") return Response.json({ error: "state is required" }, { status: 400 });
    const key = await userKey(request);
    if (!key) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
    const payload = JSON.stringify(body.state);
    const db = await getDb();
    await db.insert(userStates).values({ userKey: key, payload }).onConflictDoUpdate({ target: userStates.userKey, set: { payload, updatedAt: sql`CURRENT_TIMESTAMP` } });
    return Response.json({ saved: true });
  } catch (error) {
    return errorResponse(error);
  }
}

import { currentUser } from "../../../../lib/auth";
export async function GET(request: Request) {
  const user = await currentUser(request);
  return user ? Response.json({ user: { id: user.id, name: user.name, method: user.channel === "email" ? "google" : "mobile", label: user.destination, createdAt: user.createdAt } }) : Response.json({ user: null }, { status: 401 });
}

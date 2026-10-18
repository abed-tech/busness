import { auth } from "@ceremonia/server";
import { json, hostAllowed, bearer } from "@/lib/api";

export const dynamic = "force-dynamic";

/** POST /api/v1/auth/logout : révoque le jeton présenté. */
export async function POST(req: Request) {
  if (!hostAllowed(req)) return new Response("Not found", { status: 404 });
  await auth.deleteSession(bearer(req));
  return json({ ok: true });
}

import { dataClient } from "@ceremonia/server";
import { requireApiOrganizer, json, apiError, dbErrorResponse, UUID } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/v1/events/{id} : détail d'un événement visible par l'organisateur. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await requireApiOrganizer(req);
  if (me instanceof Response) return me;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return apiError(400, "bad_request", "Identifiant invalide.");
  const { data, error } = await dataClient(me.ctx).from("events").select("*").eq("id", id).maybeSingle();
  if (error) return dbErrorResponse(error);
  if (!data) return apiError(404, "not_found", "Événement introuvable.");
  return json({ data });
}

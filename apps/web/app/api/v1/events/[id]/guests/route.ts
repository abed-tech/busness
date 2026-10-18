import { dataClient } from "@ceremonia/server";
import { requireApiOrganizer, json, apiError, dbErrorResponse, UUID } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/v1/events/{id}/guests : invités de l'événement (organisateur autorisé uniquement). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await requireApiOrganizer(req);
  if (me instanceof Response) return me;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return apiError(400, "bad_request", "Identifiant invalide.");
  const { data, error } = await dataClient(me.ctx).from("guests")
    .select("id, name, kind, whatsapp, table_no, placed_manually, rsvp, invite_token, code, whatsapp_opened_at, sort_order")
    .eq("event_id", id).order("sort_order");
  if (error) return dbErrorResponse(error);
  return json({ data });
}

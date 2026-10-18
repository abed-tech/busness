import { dataClient } from "@ceremonia/server";
import { requireApiOrganizer, json, dbErrorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/v1/me : profil de l'organisateur connecté (null si le profil n'est pas encore créé). */
export async function GET(req: Request) {
  const me = await requireApiOrganizer(req);
  if (me instanceof Response) return me;
  const { data, error } = await dataClient(me.ctx).from("profiles").select("id, username, full_name, phone, status, status_reason").eq("id", me.id).maybeSingle();
  if (error) return dbErrorResponse(error);
  return json({ id: me.id, email: me.email, profile: data });
}

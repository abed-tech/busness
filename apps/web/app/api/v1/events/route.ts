import { dataClient } from "@ceremonia/server";
import { requireApiOrganizer, json, dbErrorResponse } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/v1/events : événements visibles par l'organisateur (règles RLS). */
export async function GET(req: Request) {
  const me = await requireApiOrganizer(req);
  if (me instanceof Response) return me;
  const { data, error } = await dataClient(me.ctx).from("events")
    .select("id, short_id, title, type, event_date, event_time, venue, address, status, billing, offer, expected, table_capacity, extra_tables, phone_prefix, photos, created_at")
    .order("event_date");
  if (error) return dbErrorResponse(error);
  return json({ data });
}

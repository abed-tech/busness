import { dataClient } from "@ceremonia/server";
import { optionalApiCtx, json, apiError, dbErrorResponse, RPC_ALLOWLIST } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/rpc/{fonction}   corps : arguments nommés, ex. { "p_token": "…" }
 * Appelle une fonction de la base de la liste autorisée, avec l'identité du jeton (ou anonyme).
 * La fonction revérifie les droits : jeton d'invitation, session du personnel, propriétaire de l'événement.
 */
export async function POST(req: Request, ctx: { params: Promise<{ fn: string }> }) {
  const { fn } = await ctx.params;
  if (!RPC_ALLOWLIST.has(fn)) return apiError(404, "not_found", "Fonction inconnue.");
  const c = await optionalApiCtx(req);
  if (c instanceof Response) return c;
  let args: Record<string, unknown> = {};
  const text = await req.text();
  if (text.length > 256 * 1024) return apiError(413, "too_large", "Requête trop volumineuse.");
  if (text) { try { args = JSON.parse(text); } catch { return apiError(400, "bad_request", "Corps JSON attendu."); } }
  if (!args || typeof args !== "object" || Array.isArray(args) || Object.keys(args).some((k) => !/^p_[a-z_]{1,40}$/.test(k))) return apiError(400, "bad_request", "Arguments nommés « p_… » attendus.");
  const r = await dataClient(c).rpc(fn, args);
  if (r.error) return dbErrorResponse(r.error);
  return json({ data: r.data });
}

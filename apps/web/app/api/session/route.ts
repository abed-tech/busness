import { cookies } from "next/headers";
import { auth } from "@ceremonia/server";
import { json, hostAllowed } from "@/lib/api";
import { ORG_COOKIE, IDLE_MINUTES, RETURN_MINUTES, orgPath } from "@/lib/data/server";

/**
 * Activité de l'organisateur sur une page déjà ouverte (SessionGuard) : POST { kind, path }.
 * - kind « activity » : interaction réelle (clic, saisie, défilement, retour sur l'onglet). La base mesure l'absence
 *   écoulée, puis enregistre l'activité ; réponse « stay » (moins de 10 min), « events » (10 à moins de 30 min).
 * - kind « check » : simple vérification après une longue inactivité, sans compter comme une activité.
 * Réponse « login » : session fermée (30 min ou plus, ou déconnexion), mot de passe exigé.
 * Le navigateur ne fournit aucune durée : il ne peut ni prolonger une session fermée ni raccourcir les délais.
 */
export async function POST(req: Request) {
  if (!hostAllowed(req)) return new Response("Not found", { status: 404 });
  const body = (await req.json().catch(() => null)) as { kind?: string; path?: string } | null;
  const s = await auth.getSession((await cookies()).get(ORG_COOKIE)?.value, "org", IDLE_MINUTES, { touch: false });
  if (!s) return json({ action: "login" });
  if (body?.kind === "check") return json({ action: "stay" });
  const away = s.idleSeconds >= RETURN_MINUTES * 60;
  await auth.touchSession(s.sessionId, away ? null : orgPath(body?.path));
  return json({ action: away ? "events" : "stay" });
}

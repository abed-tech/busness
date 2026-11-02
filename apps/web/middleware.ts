import { NextResponse, type NextRequest } from "next/server";

// Pages ouvertes sans compte : accueil, connexion, invitations (/i), personnel (/k), page Service (/s), médias publics.
const PUBLIC = ["/", "/login", "/signup", "/forgot", "/reset", "/auth", "/i", "/k", "/s", "/media"];
const ORG_COOKIE = "cer-org";
const NAV_COOKIE = "cer-nav";

/**
 * 1. Refuse toute requête qui n'arrive pas par le domaine organisateur (le domaine admin n'est jamais servi ici).
 * 2. Redirige vers la connexion si aucune session n'est présentée pour l'espace organisateur.
 * La session elle-même est vérifiée côté serveur (base de données) par requireOrganizer ; les droits par la base.
 */
export function middleware(req: NextRequest) {
  const orgHost = process.env.ORGANIZER_ORIGIN ? new URL(process.env.ORGANIZER_ORIGIN).host : null;
  const adminHost = process.env.ADMIN_ORIGIN ? new URL(process.env.ADMIN_ORIGIN).host : null;
  const host = req.headers.get("host");
  if (process.env.NODE_ENV === "production" && (!orgHost || host !== orgHost || host === adminHost)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const path = req.nextUrl.pathname;
  const isPublic = PUBLIC.some((p) => path === p || (p !== "/" && path.startsWith(p + "/")));
  if (!isPublic && !req.cookies.get(ORG_COOKIE)?.value) {
    const u = new URL("/login", req.url);
    u.searchParams.set("next", path);
    return NextResponse.redirect(u);
  }
  // chemin demandé, lu par la mise en page d'un événement (un brouillon non payé n'ouvre que ses étapes de création)
  // et par les règles de retour de la session (page complète, avec la recherche et les filtres)
  const headers = new Headers(req.headers);
  headers.set("x-skyevenapp-path", path); // remplace toute valeur envoyée par le navigateur
  headers.set("x-skyevenapp-url", path + req.nextUrl.search);
  headers.delete("x-skyevenapp-fresh");
  // cer-nav : cookie de session du navigateur (sans date d'expiration, effacé à sa fermeture). Absent = premier
  // affichage après la réouverture du navigateur : la dernière page consultée peut être rouverte (moins de 10 min).
  const orgSpace = !isPublic || path === "/" || path === "/login";
  const fresh = orgSpace && !req.cookies.get(NAV_COOKIE)?.value;
  if (fresh) headers.set("x-skyevenapp-fresh", "1");
  const res = NextResponse.next({ request: { headers } });
  if (fresh) res.cookies.set(NAV_COOKIE, "1", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|api/).*)"] };

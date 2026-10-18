import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login"];
const ADMIN_COOKIE = "cer-adm";

/**
 * 1. Refuse toute requête qui n'arrive pas par le domaine admin (jamais sur le domaine organisateur).
 * 2. Sans cookie de session : vers la connexion.
 * La session (durée, inactivité ADMIN_IDLE_MINUTES, second facteur aal2) est vérifiée côté serveur, en base,
 * par requireAdmin et la page /mfa ; chaque permission est revérifiée par la base.
 */
export function middleware(req: NextRequest) {
  const adminHost = process.env.ADMIN_ORIGIN ? new URL(process.env.ADMIN_ORIGIN).host : null;
  const orgHost = process.env.ORGANIZER_ORIGIN ? new URL(process.env.ORGANIZER_ORIGIN).host : null;
  const host = req.headers.get("host");
  if (process.env.NODE_ENV === "production" && (!adminHost || host !== adminHost || host === orgHost)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const path = req.nextUrl.pathname;
  const isPublic = PUBLIC.some((p) => path === p || path.startsWith(p + "/"));
  if (!isPublic && !req.cookies.get(ADMIN_COOKIE)?.value) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

// /api/health : santé pour Render, sans session ni contrôle de domaine (aucune donnée exposée).
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|api/health).*)"] };

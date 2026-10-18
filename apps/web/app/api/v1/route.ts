import { json, hostAllowed, RPC_ALLOWLIST } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/v1 : description de l'API (aucune donnée, aucun secret). Détails : docs/API.md. */
export function GET(req: Request) {
  if (!hostAllowed(req)) return new Response("Not found", { status: 404 });
  return json({
    name: "Cérémonia API",
    version: "1",
    auth: "POST /api/v1/auth/login → token ; puis « Authorization: Bearer <token> »",
    endpoints: [
      { method: "GET", path: "/api/health", auth: false },
      { method: "POST", path: "/api/v1/auth/login", auth: false },
      { method: "POST", path: "/api/v1/auth/logout", auth: true },
      { method: "GET", path: "/api/v1/me", auth: true },
      { method: "GET", path: "/api/v1/events", auth: true },
      { method: "GET", path: "/api/v1/events/{id}", auth: true },
      { method: "GET", path: "/api/v1/events/{id}/guests", auth: true },
      { method: "POST", path: "/api/v1/events/{id}/checkout", auth: true },
      { method: "POST", path: "/api/v1/rpc/{fonction}", auth: "selon la fonction", functions: [...RPC_ALLOWLIST] },
    ],
  });
}

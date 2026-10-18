import { NextResponse } from "next/server";
import { asOwner } from "@ceremonia/server";

export const dynamic = "force-dynamic";

/**
 * Vérification de santé pour Render (healthCheckPath) et la supervision.
 * - GET /api/health        : le serveur répond (aucune donnée, aucun secret).
 * - GET /api/health?db=1   : vérifie aussi que PostgreSQL répond.
 * Exemptée du contrôle de domaine : Render l'appelle par une adresse interne.
 */
export async function GET(req: Request) {
  const body: Record<string, unknown> = { status: "ok", service: "ceremonia-admin", time: new Date().toISOString() };
  const headers = { "Cache-Control": "no-store" };
  if (new URL(req.url).searchParams.get("db") === "1") {
    try {
      await Promise.race([asOwner((q) => q.query("select 1")), new Promise((_, ko) => setTimeout(() => ko(new Error("délai")), 4000))]);
      body.db = "ok";
    } catch {
      return NextResponse.json({ ...body, status: "error", db: "injoignable" }, { status: 503, headers });
    }
  }
  return NextResponse.json(body, { headers });
}

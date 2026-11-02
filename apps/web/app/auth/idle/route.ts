import { NextResponse, type NextRequest } from "next/server";
import { currentSession, endSession } from "@/lib/data/server";

/**
 * Session fermée (30 minutes sans activité, ou expirée) : efface le cookie devenu inutile et affiche la connexion,
 * qui exige le mot de passe. Une session encore valide n'est jamais fermée par ce lien : retour à « Mes événements ».
 */
export async function GET(req: NextRequest) {
  if (await currentSession()) return NextResponse.redirect(new URL("/events", req.url));
  await endSession();
  return NextResponse.redirect(new URL("/login?e=idle", req.url));
}

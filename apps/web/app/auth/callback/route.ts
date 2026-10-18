import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@ceremonia/server";
import { startSession } from "@/lib/data/server";

/** Lien de confirmation d'inscription reçu par e-mail : /auth/callback?type=confirm&token=… (une seule fois, 24 h). */
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type");
  const token = req.nextUrl.searchParams.get("token") || "";
  if (type === "confirm") {
    const uid = await auth.consumeOneTimeToken(token, "confirm");
    if (uid) {
      await auth.confirmEmail(uid);
      await startSession(uid);
      return NextResponse.redirect(new URL("/onboarding", req.url));
    }
  }
  return NextResponse.redirect(new URL("/login?e=link", req.url));
}

import { readPhoto } from "@ceremonia/server";

export const dynamic = "force-dynamic";

/** Photo d'invitation, lue dans la base (servie uniquement si elle est utilisée par un événement actif). */
export async function GET(_: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const p = (path || []).map(decodeURIComponent).join("/");
  const photo = await readPhoto(p).catch(() => null);
  if (!photo) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(new Uint8Array(photo.content), {
    headers: {
      "Content-Type": photo.contentType,
      "Content-Length": String(photo.content.length),
      // le chemin contient un identifiant unique : la photo ne change jamais à cette adresse
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Robots-Tag": "noindex",
    },
  });
}

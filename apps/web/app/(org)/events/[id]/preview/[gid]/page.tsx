import { redirect } from "next/navigation";

/** Ancienne adresse de l'aperçu : l'aperçu s'affiche désormais seul, sans l'interface de gestion. */
export default async function OldPreview({ params }: { params: Promise<{ id: string; gid: string }> }) {
  const { id, gid } = await params;
  redirect(`/preview/${encodeURIComponent(id)}/${encodeURIComponent(gid)}`);
}

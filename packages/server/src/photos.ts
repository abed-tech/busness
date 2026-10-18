import { withCtx, ANON, type Ctx } from "./db";
import { toDbError, type DbError } from "./data";

/**
 * Photos d'invitation stockées dans PostgreSQL (persistant, sauvegardé avec la base ; aucun disque éphémère).
 * Écriture et suppression avec les droits de l'utilisateur (règles RLS : seul qui peut modifier l'événement).
 * Lecture publique par chemin, seulement si la photo est utilisée par un événement non supprimé.
 */
export async function putPhoto(ctx: Ctx, path: string, eventId: string, content: Buffer, contentType: string): Promise<{ error: DbError | null }> {
  try {
    await withCtx(ctx, (q) => q.query(
      "insert into public.event_photo_files (path, event_id, content, content_type, size_bytes) values ($1, $2, $3, $4, $5)",
      [path, eventId, content, contentType, content.length]));
    return { error: null };
  } catch (e) { return { error: toDbError(e) }; }
}

export async function removePhotos(ctx: Ctx, paths: string[]): Promise<{ error: DbError | null }> {
  if (!paths.length) return { error: null };
  try {
    await withCtx(ctx, (q) => q.query("delete from public.event_photo_files where path = any($1)", [paths]));
    return { error: null };
  } catch (e) { return { error: toDbError(e) }; }
}

export async function readPhoto(path: string): Promise<{ content: Buffer; contentType: string; createdAt: string } | null> {
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(path)) return null;
  const r = await withCtx(ANON, (q) => q.query("select content, content_type, created_at::text as created_at from public.photo_file($1)", [path]));
  const row = r.rows[0];
  return row ? { content: row.content as Buffer, contentType: row.content_type, createdAt: row.created_at } : null;
}

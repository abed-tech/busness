import { pool } from "./db";
import { cleanupAuth } from "./auth";

/**
 * Tâches planifiées (remplacent pg_cron) : exécutées par le serveur au démarrage puis toutes les heures.
 * Toutes sont rejouables sans effet (idempotentes) ; un verrou empêche deux services de les lancer en même temps.
 * - clôture du mois écoulé (rapports figés), - règle de conservation (si activée par l'admin),
 * - brouillons de création jamais payés et inactifs depuis 30 jours, - sessions expirées du personnel et des comptes.
 */
const LOCK = 742001; // identifiant arbitraire du verrou consultatif

export async function runScheduledJobs(): Promise<{ ran: boolean; errors: string[] }> {
  const errors: string[] = [];
  const c = await pool().connect();
  try {
    const got = (await c.query("select pg_try_advisory_lock($1) as ok", [LOCK])).rows[0].ok as boolean;
    if (!got) return { ran: false, errors };
    try {
      const step = async (name: string, sql: string) => {
        try { await c.query(sql); } catch (e) { errors.push(`${name} : ${(e as Error).message}`); }
      };
      // une seule fois par mois (la fonction journalise chaque appel)
      await step("clôture mensuelle", "select public.close_month() where not exists (select 1 from public.monthly_reports where month = date_trunc('month', now() - interval '1 month')::date)");
      await step("conservation", "select public.purge_expired_events()");
      await step("brouillons abandonnés", "select public.purge_stale_drafts(30)");
      await step("sessions du personnel", "delete from public.staff_sessions where expires_at < now()");
      try { await cleanupAuth(); } catch (e) { errors.push(`sessions : ${(e as Error).message}`); }
    } finally {
      await c.query("select pg_advisory_unlock($1)", [LOCK]).catch(() => undefined);
    }
  } finally {
    c.release();
  }
  if (errors.length) console.error("Tâches planifiées :", errors.join(" | "));
  return { ran: true, errors };
}

let timer: ReturnType<typeof setInterval> | null = null;
export function startScheduler(intervalMs = 60 * 60 * 1000): void {
  if (timer || process.env.DISABLE_SCHEDULER === "1") return;
  const tick = () => { runScheduledJobs().catch((e) => console.error("Tâches planifiées :", (e as Error).message)); };
  setTimeout(tick, 15_000);
  timer = setInterval(tick, intervalMs);
  timer.unref?.();
}

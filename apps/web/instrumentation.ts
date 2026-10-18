/** Démarrage du serveur : tâches planifiées (clôture mensuelle, conservation, nettoyage des sessions). Voir @ceremonia/server/jobs. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@ceremonia/server");
    startScheduler();
  }
}

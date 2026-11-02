import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Saisies non enregistrées d'un formulaire, gardées dans ce navigateur (localStorage) jusqu'à l'envoi réussi :
 * elles survivent à une actualisation, à la fermeture du navigateur, au retour sur « Mes événements » et à une
 * nouvelle connexion après 30 minutes d'inactivité. Rien n'est envoyé au serveur avant l'enregistrement normal.
 * Les mots de passe, fichiers et champs cachés ne sont jamais gardés.
 */
type Saved = { t: number; sent?: boolean; step: number; v: Record<string, string | boolean> };
const PREFIX = "cer-form:";
const MAX_AGE = 7 * 24 * 3600_000;
const FIRST = ["type", "offer"]; // champs qui font apparaître d'autres champs : restaurés en premier

const read = (k: string): Saved | null => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
const write = (k: string, s: Saved | null) => { try { if (s) localStorage.setItem(k, JSON.stringify(s)); else localStorage.removeItem(k); } catch { /* stockage indisponible */ } };

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const isField = (el: unknown): el is Field => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
const kept = (el: Field) => !!el.name && !(el instanceof HTMLInputElement && ["hidden", "file", "password", "submit", "button"].includes(el.type));

/** Remplit un champ comme une saisie de l'utilisateur (les champs contrôlés par React reçoivent la valeur). */
function fill(el: Field, v: string | boolean) {
  if (el instanceof HTMLInputElement && el.type === "checkbox") { if (el.checked !== v) el.click(); return; }
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, String(v));
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}

export function useFormDraft(form: RefObject<HTMLFormElement | null>, key: string, step: number, setStep: (n: number) => void) {
  const k = PREFIX + key;
  const [restored, setRestored] = useState(false);
  const dirty = useRef(false);
  const restoring = useRef(false);
  const stepRef = useRef(step);
  stepRef.current = step;

  const snapshot = (sent: boolean): Saved | null => {
    const f = form.current;
    if (!f) return null;
    const v: Saved["v"] = {};
    for (const el of Array.from(f.elements)) if (isField(el) && kept(el)) v[el.name] = el instanceof HTMLInputElement && el.type === "checkbox" ? el.checked : el.value;
    return { t: Date.now(), sent, step: stepRef.current, v };
  };
  const save = (sent = false) => { if (dirty.current) write(k, snapshot(sent)); };

  // restauration au montage, puis enregistrement à chaque saisie
  useEffect(() => {
    const f = form.current;
    if (!f) return;
    const s = read(k);
    if (s && (s.sent || Date.now() - s.t > MAX_AGE)) write(k, null);
    else if (s) {
      restoring.current = true;
      const apply = (first: boolean) => {
        for (const [n, v] of Object.entries(s.v)) {
          if (FIRST.includes(n) !== first) continue;
          const el = f.elements.namedItem(n);
          if (isField(el) && kept(el)) fill(el, v);
        }
      };
      apply(true);
      setTimeout(() => { apply(false); setStep(s.step); restoring.current = false; dirty.current = true; setRestored(true); }, 0);
    }
    let timer = 0;
    const onEdit = () => { if (restoring.current) return; dirty.current = true; clearTimeout(timer); timer = window.setTimeout(() => save(), 300); };
    f.addEventListener("input", onEdit);
    f.addEventListener("change", onEdit);
    return () => { f.removeEventListener("input", onEdit); f.removeEventListener("change", onEdit); clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);
  // l'écran en cours fait partie de la saisie
  useEffect(() => { if (!restoring.current) save(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [step]);

  return {
    restored,
    /** Envoi du formulaire : la saisie sera oubliée, sauf si l'enregistrement échoue (save()). */
    markSent: () => save(true),
    save: () => save(false),
    /** Changement fait sans saisie au clavier (fichier importé) : gardé lui aussi, après l'affichage. */
    edited: () => { dirty.current = true; setTimeout(() => save(), 100); },
    /** Abandonne la saisie gardée et revient aux valeurs enregistrées. */
    discard: () => { write(k, null); location.reload(); },
  };
}

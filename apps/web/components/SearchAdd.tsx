import Link from "next/link";

/** Barre de recherche fixe (formulaire GET, comme avant) avec le bouton d'ajout juste à droite. */
export function SearchAdd({ q, placeholder, hidden, addHref, addLabel }: { q?: string; placeholder: string; hidden?: Record<string, string>; addHref?: string; addLabel: string }) {
  return (
    <div className="searchadd">
      <form role="search" className="searchadd-f">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
        <input className="in" type="search" name="q" defaultValue={q || ""} placeholder={placeholder} aria-label="Rechercher" enterKeyHint="search" />
        {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <button type="submit" className="sr-only">Rechercher</button>
      </form>
      {addHref && <Link className="btn addbtn" href={addHref} aria-label={addLabel} title={addLabel}><span aria-hidden="true">+</span></Link>}
    </div>
  );
}

export type AddMode = "one" | "file" | "paste";
export const isAddMode = (m: string | undefined): m is AddMode => m === "one" || m === "file" || m === "paste";

/** Les trois façons d'ajouter : chaque carte mène à son parcours (paramètre ?mode=). */
export function AddModes({ base, current, text }: { base: string; current: AddMode | null; text: Record<AddMode, string> }) {
  const modes: [AddMode, string, string][] = [
    ["one", "Ajouter manuellement", "M12 5v14M5 12h14"],
    ["file", "Importer une liste", "M12 15V4M7.5 8.5 12 4l4.5 4.5M5 15v4h14v-4"],
    ["paste", "Coller une liste", "M9 4h6v3H9zM7 5.5H5.5V20h13V5.5H17M8.5 11h7M8.5 14.5h7"],
  ];
  return (
    <nav className={"addmodes" + (current ? " compact" : "")} aria-label="Mode d’ajout">
      {modes.map(([m, t, d]) => (
        <Link key={m} className="addmode" href={`${base}?mode=${m}`} aria-current={current === m ? "page" : undefined} replace={!!current}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
          <span><b>{t}</b><small>{text[m]}</small></span>
        </Link>
      ))}
    </nav>
  );
}

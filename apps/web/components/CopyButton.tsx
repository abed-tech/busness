"use client";
import { useState } from "react";

export function CopyButton({ text, label = "Copier" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn ghost sm" onClick={async () => {
      try { await navigator.clipboard.writeText(text); } catch { window.prompt("Copiez ce texte :", text); }
      setDone(true); setTimeout(() => setDone(false), 1800);
    }}>{done ? "Copié ✓" : label}</button>
  );
}

"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { uploadPhotos, removePhoto } from "@/app/(org)/events/actions";

/** Réduit une grande photo dans le navigateur (2000 px, JPEG) avant l'envoi : rapide même en 3G, jamais rejetée pour sa taille. */
async function shrink(f: File): Promise<File> {
  if (f.size < 1_500_000 && (f.type === "image/jpeg" || f.type === "image/png" || f.type === "image/webp")) return f;
  try {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
    return blob ? new File([blob], f.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : f;
  } catch {
    return f; // format non lisible ici (ex. HEIC) : le serveur expliquera quoi faire
  }
}

export function PhotoManager({ eventId, photos }: { eventId: string; photos: { path: string; url: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok?: boolean; message?: string } | null>(null);
  async function add(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, 4 - photos.length);
    if (!list.length) { setMsg({ ok: false, message: "4 photos au maximum. Retirez-en une." }); return; }
    setMsg(null);
    for (let i = 0; i < list.length; i++) {
      setBusy(`Envoi de la photo ${i + 1} sur ${list.length}…`);
      const fd = new FormData();
      fd.set("event_id", eventId);
      fd.append("photos", await shrink(list[i]));
      const r = await uploadPhotos(null, fd);
      if (!r?.ok) { setMsg(r); break; }
      if (i === list.length - 1) setMsg(r);
    }
    setBusy("");
    router.refresh();
  }
  async function del(path: string) {
    const fd = new FormData(); fd.set("event_id", eventId); fd.set("path", path);
    setBusy("Suppression…"); setMsg(await removePhoto(null, fd)); setBusy(""); router.refresh();
  }
  return (
    <div className="form">
      <div className="row">
        {photos.map((p, i) => (
          <figure key={p.path} style={{ margin: 0, position: "relative", width: 120 }}>
            <img src={p.url} alt={`Photo ${i + 1}`} style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 10, border: "1px solid var(--line)" }} />
            <button type="button" className="btn danger sm" style={{ marginTop: 6, width: "100%" }} disabled={!!busy} onClick={() => del(p.path)}>Retirer</button>
          </figure>
        ))}
        {photos.length < 4 && (
          <label className="btn ghost" style={{ position: "relative", width: 120, height: 120, flexDirection: "column" }}>
            <span style={{ fontSize: "1.6rem" }}>+</span><small>Ajouter</small>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/*" multiple disabled={!!busy}
              style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} onChange={(e) => { const f = e.target.files; add(f); e.target.value = ""; }} />
          </label>
        )}
      </div>
      {busy && <p className="hint" aria-live="polite">{busy}</p>}
      {msg?.message && <div className={"notice " + (msg.ok ? "ok" : "bad")} role="status">{msg.message}</div>}
    </div>
  );
}

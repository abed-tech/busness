"use client";
import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

/**
 * Lecture des QR codes : caméra en direct (jsQR sur les images de la vidéo), photo prise avec l'appareil,
 * ou saisie du code à 6 caractères. Fonctionne sur https et sur localhost.
 */
export function Scanner({ onCode, busy }: { onCode: (code: string) => void; busy: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [live, setLive] = useState(false);
  const [err, setErr] = useState("");
  const last = useRef({ code: "", at: 0 });
  const stream = useRef<MediaStream | null>(null);
  // toujours la dernière version du rappel et de l'état « occupé » (la boucle caméra vit plus longtemps qu'un rendu)
  const cb = useRef(onCode);
  cb.current = onCode;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  function emit(code: string) {
    const now = Date.now();
    if (code === last.current.code && now - last.current.at < 4000) return; // même QR encore devant la caméra
    last.current = { code, at: now };
    if (navigator.vibrate) navigator.vibrate(60);
    cb.current(code);
  }

  function decode(src: CanvasImageSource, w: number, h: number): string | null {
    const k = Math.min(1, 900 / Math.max(w, h));
    const c = document.createElement("canvas");
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(src, 0, 0, c.width, c.height);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" })?.data || null;
  }

  useEffect(() => {
    if (!live) return;
    let stop = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        stream.current = s;
        if (!video.current) return;
        video.current.srcObject = s;
        await video.current.play();
        const loop = () => {
          if (stop) return;
          const v = video.current;
          if (v && v.readyState >= 2 && !busyRef.current) {
            const code = decode(v, v.videoWidth, v.videoHeight);
            if (code) emit(code);
          }
          setTimeout(loop, 250);
        };
        loop();
      } catch {
        setErr("Caméra indisponible ou refusée. Utilisez « Prendre une photo » ou saisissez le code.");
        setLive(false);
      }
    })();
    return () => { stop = true; stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  async function fromFile(f: File) {
    setErr("");
    try {
      const bmp = await createImageBitmap(f);
      const code = decode(bmp, bmp.width, bmp.height);
      if (code) emit(code); else setErr("Aucun QR code lisible sur la photo. Rapprochez-vous et réessayez.");
    } catch { setErr("Image illisible. Réessayez avec une autre photo."); }
  }

  return (
    <div className="form">
      {live ? (
        <>
          <div className="cam"><video ref={video} playsInline muted /></div>
          <button className="btn ghost" onClick={() => setLive(false)}>Arrêter la caméra</button>
        </>
      ) : (
        <button className="btn bigbtn" onClick={() => { setErr(""); setLive(true); }}>Scanner avec la caméra</button>
      )}
      <label className="btn ghost" style={{ position: "relative" }}>Prendre une photo du QR code
        <input type="file" accept="image/*" capture="environment" style={{ position: "absolute", inset: 0, opacity: 0 }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) fromFile(f); }} />
      </label>
      <form className="row" onSubmit={(e) => { e.preventDefault(); const i = (e.currentTarget.elements.namedItem("code") as HTMLInputElement); if (i.value.trim()) { onCode(i.value.trim()); i.value = ""; } }}>
        <input className="in" name="code" placeholder="Ou saisir le code à 6 caractères" aria-label="Code de l’invitation" maxLength={40} autoComplete="off" autoCapitalize="characters" style={{ flex: 1 }} />
        <button className="btn ghost" type="submit" disabled={busy}>Valider</button>
      </form>
      {err && <div className="notice bad" role="alert">{err}</div>}
    </div>
  );
}

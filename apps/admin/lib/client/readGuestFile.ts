import { xlsxToText } from "@ceremonia/core";

/** Lecture d'un fichier invités dans le navigateur : .xlsx, CSV (UTF-8, UTF-16 ou Windows-1252), texte. */
export async function readGuestFile(file: File): Promise<string> {
  if (file.size > 5_000_000) throw new Error("Fichier trop volumineux (5 Mo maximum).");
  const buf = await file.arrayBuffer();
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0x50 && u8[1] === 0x4b) {
    if (typeof DecompressionStream !== "function") throw new Error("Ce navigateur ne lit pas les fichiers Excel. Enregistrez le fichier en CSV.");
    return xlsxToText(
      buf,
      (xml) => new DOMParser().parseFromString(xml, "application/xml"),
      (raw) => new Response(new Blob([new Uint8Array(raw)]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text(),
    );
  }
  if (u8[0] === 0xd0 && u8[1] === 0xcf) throw new Error("L’ancien format .xls n’est pas pris en charge. Enregistrez le fichier en .xlsx ou en CSV.");
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder("utf-16le").decode(u8);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(u8);
  } catch {
    return new TextDecoder("windows-1252").decode(u8);
  }
}

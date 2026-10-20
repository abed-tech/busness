import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Codes à 6 chiffres des applications d'authentification (RFC 6238 : HMAC-SHA1, pas de 30 s). */
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const b of buf) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += ALPHA[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHA[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=]/g, "");
  let bits = 0, value = 0; const out: number[] = [];
  for (const ch of clean) {
    const i = ALPHA.indexOf(ch); if (i < 0) throw new Error("base32 invalide");
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export function newSecret(): string { return base32Encode(randomBytes(20)); }

export function totpAt(secret: string, step: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** digits).padStart(digits, "0");
}

export const stepOf = (ms = Date.now()) => Math.floor(ms / 1000 / 30);

/** Vérifie un code (décalage d'horloge toléré : ±1 pas). Refuse un pas déjà utilisé. Renvoie le pas accepté ou null. */
export function verifyTotp(secret: string, code: string, lastUsedStep: number | null, ms = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const now = stepOf(ms);
  for (const s of [now, now - 1, now + 1]) {
    if (lastUsedStep != null && s <= lastUsedStep) continue;
    const a = Buffer.from(totpAt(secret, s)), b = Buffer.from(code);
    if (timingSafeEqual(a, b)) return s;
  }
  return null;
}

export function otpauthUri(secret: string, account: string, issuer = "Skyevenapp Admin"): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

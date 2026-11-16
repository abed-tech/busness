import { z } from "zod";
import { isWeddingKind } from "@ceremonia/core";

export const WEDDING_KIND_REQUIRED = "Précisez le type de mariage (civil, coutumier, religieux ou une combinaison).";

export const GUEST_COUNT = "Indiquez le nombre d’invités (un nombre entier, au moins 1) : il sert à préparer les tables.";

/** Champs de l'événement, un par un (réglages partiels : EventFields.pick). */
export const EventFields = z.object({
  type: z.enum(["mariage", "fiancailles", "anniversaire", "bapteme", "gala", "conference"]),
  host_a: z.string().trim().max(80).default(""),
  host_b: z.string().trim().max(80).default(""),
  title: z.string().trim().min(1, "Titre requis.").max(160),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide."),
  event_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Heure invalide."),
  venue: z.string().trim().min(1, "Nom du lieu requis.").max(160),
  address: z.string().trim().min(1, "Adresse requise.").max(300),
  dress: z.string().trim().max(160).default(""),
  message: z.string().max(2000).default(""),
  program: z.string().max(3000).default(""),
  // nombre d'invités obligatoire : il sert à préparer les tables (revérifié par la base) ; il ne change pas le prix
  expected: z.coerce.number({ invalid_type_error: GUEST_COUNT }).int("Le nombre d’invités doit être un nombre entier.").min(1, GUEST_COUNT).max(10000, "Nombre d’invités : 10 000 au maximum."),
  table_capacity: z.coerce.number().int().min(1, "Places par table : 1 minimum.").max(100),
  offer: z.enum(["both", "drinks", "food", "none"]),
  phone_prefix: z.string().regex(/^\+\d{1,4}$/, "Indicatif invalide (ex. +243).").default("+243"),
  // type de mariage : obligatoire pour un mariage, toujours vide pour les autres types (revérifié par la base)
  wedding_kind: z.string().trim().default(""),
});
/** Formulaire complet de l'événement (création, brouillon, modification). */
export const EventSchema = EventFields.superRefine((v, ctx) => {
  if (v.type === "mariage" && !isWeddingKind(v.wedding_kind)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["wedding_kind"], message: WEDDING_KIND_REQUIRED });
}).transform((v) => ({ ...v, wedding_kind: v.type === "mariage" ? v.wedding_kind : "" }));
export type EventInput = z.infer<typeof EventSchema>;

export const uuid = z.string().uuid();
export const lines = (v: FormDataEntryValue | null, max = 100) =>
  [...new Set(String(v || "").split("\n").map((s) => s.trim().slice(0, 80)).filter(Boolean).map((s) => s))].slice(0, max);

import { z } from "zod";

export const EventSchema = z.object({
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
  expected: z.coerce.number().int().min(0).max(10000).default(0),
  table_capacity: z.coerce.number().int().min(1, "Places par table : 1 minimum.").max(100),
  offer: z.enum(["both", "drinks", "food", "none"]),
  phone_prefix: z.string().regex(/^\+\d{1,4}$/, "Indicatif invalide (ex. +243).").default("+243"),
});
export type EventInput = z.infer<typeof EventSchema>;

export const uuid = z.string().uuid();
export const lines = (v: FormDataEntryValue | null, max = 100) =>
  [...new Set(String(v || "").split("\n").map((s) => s.trim().slice(0, 80)).filter(Boolean).map((s) => s))].slice(0, max);

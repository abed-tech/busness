"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { serverClient } from "@/lib/data/server";
import { humanError } from "@/lib/auth";
import type { FormState } from "../(auth)/actions";

export async function createProfile(_: FormState, fd: FormData): Promise<FormState> {
  const p = z.object({ username: z.string().trim().min(2).max(40), full_name: z.string().trim().max(120), phone: z.string().trim().max(20).regex(/^[+\d\s]*$/) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { message: "Nom d’utilisateur (2 à 40 caractères) et téléphone valides requis." };
  const sb = await serverClient();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) redirect("/login");
  const { error } = await sb.from("profiles").insert({ id: u.user.id, username: p.data.username, full_name: p.data.full_name || null, phone: p.data.phone || null, email: u.user.email });
  if (error && error.code !== "23505") return { message: error.code === "23514" ? "Ce compte ne peut pas devenir organisateur." : humanError(error.message, error.code) };
  redirect("/events");
}

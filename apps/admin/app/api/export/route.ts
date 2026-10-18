import { NextResponse, type NextRequest } from "next/server";
import { serverClient } from "@/lib/data/server";

export const dynamic = "force-dynamic";

/** Neutralise les formules (=, +, -, @) pour éviter l'injection dans Excel. */
function cell(v: unknown): string {
  let s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Export CSV. POST uniquement, depuis le domaine admin (contrôle d'origine), sans cache.
 * Les droits (reports.export, et finance.read pour les transactions) sont vérifiés par la base, qui journalise l'export.
 */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!process.env.ADMIN_ORIGIN || origin !== new URL(process.env.ADMIN_ORIGIN).origin) return new NextResponse("Origine refusée", { status: 403 });
  const fd = await req.formData();
  const kind = String(fd.get("kind") || "");
  const month = String(fd.get("month") || "");
  if (!["transactions", "monthly"].includes(kind) || (month && !/^\d{4}-\d{2}$/.test(month))) return new NextResponse("Requête invalide", { status: 400 });

  const sb = await serverClient();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return new NextResponse("Non connecté", { status: 401 });
  const { data, error } = await sb.rpc("admin_export", { p_kind: kind, p_month: month ? month + "-01" : null });
  if (error || !data?.ok) return new NextResponse(data?.error === "forbidden" ? "Export non autorisé pour votre rôle." : "Export impossible.", { status: data?.error === "forbidden" ? 403 : 500 });

  const rows = (data.rows || []) as Record<string, unknown>[];
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const csv = "﻿" + [cols.join(";"), ...rows.map((r) => cols.map((c) => cell(r[c])).join(";"))].join("\r\n");
  const name = `ceremonia-${kind}-${month || new Date().toISOString().slice(0, 7)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

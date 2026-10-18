"use client";
import { useActionState, type ReactNode } from "react";
import type { ActionState } from "@/components/ConfirmAction";

export function ActionForm({ action, hidden, submit, children }: { action: (p: ActionState, fd: FormData) => Promise<ActionState>; hidden: Record<string, string>; submit: string; children?: ReactNode }) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form action={run} className="form">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      {state?.message && <div className={"notice " + (state.ok ? "ok" : "bad")} role="status">{state.message}</div>}
      <div><button className="btn" type="submit" disabled={pending}>{pending ? "En cours…" : submit}</button></div>
    </form>
  );
}

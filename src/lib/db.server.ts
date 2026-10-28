import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { primaryKey } from "./query-order";

// Loose client: tables are validated by Postgres constraints and the apply_ops whitelist.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabaseAdmin as any;

export type Op =
  | { op: "assert"; table: string; pk: string; id: string; expect: Record<string, unknown> }
  | { op: "insert"; table: string; values: Record<string, unknown> }
  | { op: "update"; table: string; pk: string; id: string; values: Record<string, unknown>; expect?: Record<string, unknown> };

/** Apply several writes atomically in one Postgres transaction (all or nothing). */
export async function applyOps(ops: Op[]) {
  const { error } = await db.rpc("apply_ops", { ops });
  if (error) throw new Error(cleanError(error.message));
}

export function cleanError(msg: string) {
  return msg.replace(/^.*?(INVALID_TRANSITION|CONCURRENT_MODIFICATION|APPEND_ONLY|TABLE_NOT_ALLOWED)/, "$1");
}

export async function nextId(prefix: string): Promise<number> {
  const { data, error } = await db.rpc("next_ids", { p_prefix: prefix, p_count: 1 });
  if (error) throw new Error(error.message);
  return Number(data);
}
export const pad = (n: number, w = 6) => String(n).padStart(w, "0");

export function audit(entity_type: string, entity_id: string, action: string, actor: string, old_value: unknown, new_value: unknown, reason?: string | null): Op {
  return { op: "insert", table: "audit_records", values: { entity_type, entity_id, action, actor, old_value: old_value ?? null, new_value: new_value ?? null, reason: reason ?? null, timestamp: new Date().toISOString() } };
}
export function stateChange(entity_type: string, entity_id: string, previous_state: string | null, new_state: string, actor: string, reason?: string | null, related?: unknown): Op {
  return { op: "insert", table: "state_history", values: { entity_type, entity_id, previous_state, new_state, actor, reason: reason ?? null, related: related ?? null, changed_at: new Date().toISOString() } };
}

export async function one<T = Record<string, unknown>>(table: string, pk: string, id: string): Promise<T> {
  const { data, error } = await db.from(table).select("*").eq(pk, id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`${table} ${id} not found`);
  return data as T;
}

/** Page through a whole table (PostgREST caps responses at 1000 rows). */
export async function fetchAll<T = Record<string, unknown>>(table: string, columns = "*", orderBy?: string): Promise<T[]> {
  const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  const total = count ?? 0;
  const size = 1000;
  const pages = Math.ceil(total / size);
  const out: T[][] = new Array(pages);
  const pk = primaryKey(table);
  const order = orderBy ?? pk;
  if (!/^[a-z_][a-z0-9_]*$/.test(order)) throw new Error("Invalid sort column");
  for (let p = 0; p < pages; p += 10) {
    await Promise.all(
      Array.from({ length: Math.min(10, pages - p) }, async (_, k) => {
        const i = p + k;
        let query = db.from(table).select(columns).order(order);
        if (order !== pk) query = query.order(pk);
        const { data, error: e } = await query.range(i * size, i * size + size - 1);
        if (e) throw new Error(`${table}: ${e.message}`);
        out[i] = data as T[];
      }),
    );
  }
  return out.flat();
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const { data, error } = await db.from("settings").select("value").eq("key", key).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.value as T) ?? fallback;
}

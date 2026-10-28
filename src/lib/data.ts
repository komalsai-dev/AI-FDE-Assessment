import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { primaryKey } from "./query-order";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sb = supabase as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export async function count(table: string, f?: (q: any) => any): Promise<number> { // eslint-disable-line @typescript-eslint/no-explicit-any
  let q = sb.from(table).select("*", { count: "exact", head: true });
  if (f) q = f(q);
  const { count: c, error } = await q;
  if (error) throw new Error(error.message);
  return c ?? 0;
}

export async function rows(table: string, f?: (q: any) => any, cols = "*"): Promise<Row[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  let q = sb.from(table).select(cols);
  if (f) q = f(q);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Page through up to `limit` rows (for client-side exports and aggregates). */
export async function allRows(table: string, f?: (q: any) => any, cols = "*", order?: string, limit = Number.POSITIVE_INFINITY, ascending = true): Promise<Row[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out: Row[] = [];
  const pk = primaryKey(table);
  for (let from = 0; from < limit; from += 1000) {
    let q = sb.from(table).select(cols);
    if (f) q = f(q);
    q = q.order(order ?? pk, { ascending });
    if (order && order !== pk) q = q.order(pk, { ascending });
    const { data, error } = await q.range(from, Math.min(from + 999, limit - 1));
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const r = await rows("settings");
      const m: Row = {};
      for (const s of r) m[s.key] = s.value;
      return { simDate: (m.simulation_date as string) ?? "2026-10-28", warn: Number(m.warning_threshold_days ?? 30), raw: m, list: r };
    },
  });
}

export function toCsv(data: Row[]): string {
  const cols = data[0] ? Object.keys(data[0]) : [];
  const v = (x: unknown) => { const s = x == null ? "" : typeof x === "object" ? JSON.stringify(x) : String(x); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(","), ...data.map((r) => cols.map((c) => v(r[c])).join(","))].join("\n");
}
export function download(name: string, content: string, mime = "text/csv") {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const fmtDate = (d?: string | null) => (d ? d.slice(0, 10) : "—");
export const fmtTs = (d?: string | null) => (d ? d.slice(0, 16).replace("T", " ") : "—");
export const pct = (x: number | null | undefined) => (x == null ? "n/a" : `${(x * 100).toFixed(1)}%`);

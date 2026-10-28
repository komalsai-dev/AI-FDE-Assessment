import { useEffect, useState, type ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, RefreshCw, Search } from "lucide-react";
import { allRows, download, sb, toCsv, type Row } from "@/lib/data";
import { toast } from "sonner";
import { primaryKey, nextUtcDay } from "@/lib/query-order";

export type Column = { key: string; label: string; render?: (r: Row) => ReactNode; sortable?: boolean };
export type Filter =
  | { key: string; label: string; type?: "select"; options: (string | { value: string; label: string })[] }
  | { key: string; label: string; type: "dateFrom" | "dateTo"; column: string };

type Props = {
  table: string;
  columns: Column[];
  searchCols?: string[];
  filters?: Filter[];
  initial?: Record<string, string | undefined>;
  baseFilter?: (q: any) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  filterKey?: unknown;
  defaultSort: { key: string; asc: boolean };
  pageSize?: number;
  actions?: (r: Row) => ReactNode;
  onRowClick?: (r: Row) => void;
  title?: string;
  toolbar?: ReactNode;
  exportName?: string;
};

export function DataTable(p: Props) {
  const [q, setQ] = useState(p.initial?.q ?? "");
  const [dq, setDq] = useState(q);
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries((p.filters ?? []).map((f) => [f.key, p.initial?.[f.key] ?? ""])));
  const [sort, setSort] = useState(p.defaultSort);
  const [page, setPage] = useState(0);
  const size = p.pageSize ?? 25;
  const initialKey = JSON.stringify(p.initial ?? {});
  useEffect(() => {
    const initial = JSON.parse(initialKey) as Record<string, string>;
    setQ(initial.q ?? ""); setDq(initial.q ?? "");
    setVals(Object.fromEntries((p.filters ?? []).map((f) => [f.key, initial[f.key] ?? ""])));
    setSort(p.defaultSort); setPage(0);
  }, [p.table, initialKey]);
  useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(0); }, 300); return () => clearTimeout(t); }, [q]);

  const apply = (query: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    let x = query;
    if (p.baseFilter) x = p.baseFilter(x);
    if (dq && p.searchCols?.length) x = x.or(p.searchCols.map((c) => `${c}.ilike.%${dq.replace(/[,()]/g, "")}%`).join(","));
    for (const f of p.filters ?? []) {
      const v = vals[f.key];
      if (!v) continue;
      if (f.type === "dateFrom") x = x.gte(f.column, v);
      else if (f.type === "dateTo") x = x.lt(f.column, nextUtcDay(v));
      else x = x.eq(f.key, v);
    }
    return x;
  };

  const key = [p.table, dq, vals, sort, page, p.baseFilter?.toString(), p.filterKey];
  const query = useQuery({
    queryKey: ["table", ...key],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!p.columns.some((c) => c.key === sort.key && c.sortable !== false) && sort.key !== p.defaultSort.key) throw new Error("Unsupported sort column");
      const pk = primaryKey(p.table);
      let ordered = apply(sb.from(p.table).select("*", { count: "exact" })).order(sort.key, { ascending: sort.asc });
      if (sort.key !== pk) ordered = ordered.order(pk, { ascending: sort.asc });
      const { data, count, error } = await ordered.range(page * size, page * size + size - 1);
      if (error) throw new Error(error.message);
      return { data: data as Row[], count: count ?? 0 };
    },
  });
  const total = query.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / size));

  const exportCsv = async () => {
    try {
      const data = await allRows(p.table, apply, "*", sort.key, Number.POSITIVE_INFINITY, sort.asc);
      download(`${p.exportName ?? p.table}.csv`, toCsv(data));
      toast.success(`Exported ${data.length.toLocaleString()} rows`);
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="panel">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5">
        {p.title && <div className="panel-title mr-2">{p.title}</div>}
        {p.searchCols && (
          <label className="relative w-56">
            <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
            <input className="field pl-7" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
          </label>
        )}
        {(p.filters ?? []).map((f) => (
          <label key={f.key} className="flex items-center gap-1 text-[12px] text-muted-foreground">
            {f.label}
            {f.type === "dateFrom" || f.type === "dateTo" ? (
              <input type="date" className="field w-36" value={vals[f.key]} onChange={(e) => { setVals({ ...vals, [f.key]: e.target.value }); setPage(0); }} />
            ) : (
              <select className="field w-auto" value={vals[f.key]} onChange={(e) => { setVals({ ...vals, [f.key]: e.target.value }); setPage(0); }}>
                <option value="">All</option>
                {("options" in f ? f.options : []).map((o) => { const v = typeof o === "string" ? o : o.value; return <option key={v} value={v}>{typeof o === "string" ? o.replace(/_/g, " ") : o.label}</option>; })}
              </select>
            )}
          </label>
        ))}
        <div className="ml-auto flex gap-2">
          {p.toolbar}
          <button className="btn-outline" onClick={() => query.refetch()} aria-label="Refresh"><RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} /></button>
          <button className="btn-outline" onClick={exportCsv}><Download className="h-3.5 w-3.5" />Export</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              {p.columns.map((c) => (
                <th key={c.key}>
                  {c.sortable !== false ? (
                    <button className="inline-flex items-center gap-1 uppercase" onClick={() => setSort({ key: c.key, asc: sort.key === c.key ? !sort.asc : true })}>
                      {c.label}{sort.key === c.key && (sort.asc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                    </button>
                  ) : c.label}
                </th>
              ))}
              {p.actions && <th className="text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {query.isError && <tr><td colSpan={99} className="py-8 text-center text-destructive">Failed to load: {(query.error as Error).message}</td></tr>}
            {query.isLoading && <tr><td colSpan={99} className="py-8 text-center text-muted-foreground">Loading…</td></tr>}
            {query.data && query.data.data.length === 0 && <tr><td colSpan={99} className="py-10 text-center text-muted-foreground">No records match. Adjust filters or generate data in Settings.</td></tr>}
            {query.data?.data.map((r, i) => (
              <tr key={i} className={p.onRowClick ? "cursor-pointer" : ""} onClick={() => p.onRowClick?.(r)}>
                {p.columns.map((c) => <td key={c.key}>{c.render ? c.render(r) : r[c.key] == null ? "—" : typeof r[c.key] === "object" ? JSON.stringify(r[c.key]) : String(r[c.key])}</td>)}
                {p.actions && <td className="text-right" onClick={(e) => e.stopPropagation()}><div className="flex justify-end gap-1">{p.actions(r)}</div></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-3 py-2 text-[12px] text-muted-foreground">
        <span>{total.toLocaleString()} records</span>
        <div className="flex items-center gap-2">
          <button className="btn-ghost h-7 px-2" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
          Page {page + 1} / {pages}
          <button className="btn-ghost h-7 px-2" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}

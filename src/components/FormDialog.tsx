import { useEffect, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type Field = {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "datetime-local" | "select" | "textarea" | "checkbox";
  options?: (string | { value: string; label: string })[];
  required?: boolean;
  default?: string | number | boolean;
  help?: string;
  step?: string;
};

type Props = {
  trigger: (open: () => void) => ReactNode;
  title: string;
  description?: string;
  fields: Field[];
  submitLabel?: string;
  danger?: boolean;
  onSubmit: (v: Record<string, any>) => Promise<unknown>; // eslint-disable-line @typescript-eslint/no-explicit-any
  children?: ReactNode;
};

/** Generic validated form in a dialog. Closes only when onSubmit resolves to a non-null value. */
export function FormDialog(p: Props) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Record<string, any>>({}); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setV(Object.fromEntries(p.fields.map((f) => [f.name, f.default ?? (f.type === "checkbox" ? false : "")]))); setErr(null); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const missing = p.fields.filter((f) => f.required && (v[f.name] === "" || v[f.name] == null)).map((f) => f.label);
    if (missing.length) { setErr(`Required: ${missing.join(", ")}`); return; }
    setBusy(true);
    const out: Record<string, unknown> = {};
    for (const f of p.fields) out[f.name] = f.type === "number" && v[f.name] !== "" ? Number(v[f.name]) : f.type === "datetime-local" && v[f.name] ? new Date(v[f.name]).toISOString() : v[f.name];
    const r = await p.onSubmit(out).catch((x) => { setErr((x as Error).message); return null; });
    setBusy(false);
    if (r !== null && r !== undefined) setOpen(false);
  };

  return (
    <>
      {p.trigger(() => setOpen(true))}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{p.title}</DialogTitle>
            {p.description && <DialogDescription>{p.description}</DialogDescription>}
          </DialogHeader>
          {p.children}
          <form onSubmit={submit} className="space-y-3">
            {p.fields.map((f) => (
              <label key={f.name} htmlFor={`form-${f.name}`} className={f.type === "checkbox" ? "flex items-center gap-2 text-[13px]" : "block space-y-1"}>
                {f.type === "checkbox" ? (
                  <><input id={`form-${f.name}`} type="checkbox" checked={!!v[f.name]} onChange={(e) => setV({ ...v, [f.name]: e.target.checked })} />{f.label}</>
                ) : (
                  <>
                    <span className="text-[12px] font-medium">{f.label}{f.required && <span className="text-destructive"> *</span>}</span>
                    {f.type === "select" ? (
                      <select id={`form-${f.name}`} className="field" value={v[f.name] ?? ""} onChange={(e) => setV({ ...v, [f.name]: e.target.value })}>
                        <option value="">Select…</option>
                        {f.options?.map((o) => { const val = typeof o === "string" ? o : o.value; return <option key={val} value={val}>{typeof o === "string" ? o : o.label}</option>; })}
                      </select>
                    ) : f.type === "textarea" ? (
                      <textarea id={`form-${f.name}`} className="field h-20 py-1.5" value={v[f.name] ?? ""} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} />
                    ) : (
                      <input id={`form-${f.name}`} className="field" type={f.type ?? "text"} step={f.step ?? "any"} value={v[f.name] ?? ""} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} />
                    )}
                    {f.help && <span className="block text-[11px] text-muted-foreground">{f.help}</span>}
                  </>
                )}
              </label>
            ))}
            {err && <div className="rounded-md bg-danger-soft px-3 py-2 text-[12px] text-destructive">{err}</div>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="btn-outline" onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" className={p.danger ? "btn-danger" : "btn-primary"} disabled={busy}>{busy ? "Saving…" : p.submitLabel ?? "Save"}</button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Small action button that opens a confirm-with-reason dialog. */
export function ReasonButton(p: { label: string; title: string; danger?: boolean; disabled?: boolean; disabledReason?: string; onConfirm: (reason: string) => Promise<unknown>; requireReason?: boolean }) {
  return (
    <FormDialog title={p.title} danger={p.danger} submitLabel={p.label} fields={[{ name: "reason", label: "Reason", type: "textarea", required: p.requireReason !== false }]}
      onSubmit={(v) => p.onConfirm(v.reason as string)}
      trigger={(open) => <button className={p.danger ? "btn-outline h-7 px-2 text-destructive" : "btn-outline h-7 px-2"} disabled={p.disabled} title={p.disabled ? p.disabledReason : undefined} onClick={open}>{p.label}</button>} />
  );
}

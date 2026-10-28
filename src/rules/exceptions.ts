import { toDate } from "./dates";
import type { ExceptionRec } from "./types";

export function extensionCovers(ex: ExceptionRec, assetId: string, at: string, line: string): { ok: boolean; why?: string } {
  if (ex.asset_id !== assetId) return { ok: false, why: "different asset" };
  if (ex.approval_status !== "APPROVED") return { ok: false, why: `extension ${ex.exception_id} is ${ex.approval_status}` };
  if (!ex.approved_by) return { ok: false, why: `extension ${ex.exception_id} has no approver` };
  const t = toDate(at).getTime();
  if (t < toDate(ex.valid_from).getTime() || t >= toDate(ex.valid_until).getTime())
    return { ok: false, why: `extension ${ex.exception_id} not valid at this time (${ex.valid_from} → ${ex.valid_until})` };
  if (ex.scope !== "ALL_LINES" && ex.scope !== line) return { ok: false, why: `extension ${ex.exception_id} scoped to ${ex.scope}` };
  return { ok: true };
}

export function findCoveringExtension(list: ExceptionRec[], assetId: string, at: string, line: string) {
  let rejectedReason: string | null = null;
  for (const ex of list) {
    if (ex.asset_id !== assetId) continue;
    const r = extensionCovers(ex, assetId, at, line);
    if (r.ok) return { covering: ex, rejectedReason: null };
    rejectedReason = `Invalid extension: ${r.why}.`;
  }
  return { covering: null as ExceptionRec | null, rejectedReason };
}

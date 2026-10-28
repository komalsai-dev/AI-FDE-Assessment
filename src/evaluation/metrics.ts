import { ISSUE_TYPES, type IssueType } from "@/rules/types";
import { findingKey } from "@/rules/validation";

export type Counts = { tp: number; fp: number; fn: number; tn: number };
export const ratio = (n: number, d: number): number | null => (d === 0 ? null : n / d);

export function prf(c: Counts) {
  const precision = ratio(c.tp, c.tp + c.fp);
  const recall = ratio(c.tp, c.tp + c.fn);
  const f1 = ratio(2 * c.tp, 2 * c.tp + c.fp + c.fn);
  return { ...c, precision, recall, f1 };
}

type Key = { entity_type: string; entity_id: string; issue_type: string; rule_id?: string };

/** Compare detector findings against ground truth. TN = checked entities − TP − FP − FN (per issue type). */
export function compare(findings: Key[], truth: Key[], checked: Partial<Record<IssueType, number>>) {
  const key = (value: Key) => `${findingKey(value)}${value.rule_id ? `|${value.rule_id}` : ""}`;
  const F = new Set(findings.map(key));
  const G = new Set(truth.map(key));
  const per: Record<string, ReturnType<typeof prf>> = {};
  const total: Counts = { tp: 0, fp: 0, fn: 0, tn: 0 };
  for (const it of ISSUE_TYPES) {
    const f = [...F].filter((k) => k.startsWith(`${it}|`));
    const g = [...G].filter((k) => k.startsWith(`${it}|`));
    const gs = new Set(g);
    const tp = f.filter((k) => gs.has(k)).length;
    const fp = f.length - tp;
    const fn = g.length - tp;
    const tn = Math.max(0, (checked[it] ?? 0) - tp - fp - fn);
    per[it] = prf({ tp, fp, fn, tn });
    total.tp += tp; total.fp += fp; total.fn += fn; total.tn += tn;
  }
  const missed = [...G].filter((k) => !F.has(k));
  const unexpected = [...F].filter((k) => !G.has(k));
  return { overall: prf(total), perIssue: per, missed, unexpected };
}

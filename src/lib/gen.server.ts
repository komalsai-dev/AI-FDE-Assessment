import { db, fetchAll, getSetting, applyOps, audit, stateChange, nextId, pad, type Op } from "./db.server";
import { checksums, CHECKSUM_VERSION, canonical, sha256, ENTITY_TABLES, generate, GENERATOR_VERSION, rowCounts, type Dataset, type GenConfig } from "@/data/generator";
import { detect, type DetectorInput } from "@/rules/validation";
import { compare } from "@/evaluation/metrics";
import { assertGenerationEmpty } from "./query-order";
import { baselineInput } from "@/evaluation/cohort";
import { badPattern, dateOrder, downtimeMismatch, duplicateIds, ID_PATTERNS, invalidEnums, missingFks, type Issue } from "@/evaluation/integrity";

const USE_CHUNK = 5000;
let cache: { key: string; ds: Dataset } | null = null;
function dataset(cfg: GenConfig) {
  const key = JSON.stringify(cfg);
  if (cache?.key !== key) cache = { key, ds: generate(cfg) };
  return cache.ds;
}

export function stepsFor(cfg: GenConfig): string[] {
  const n = Math.ceil(dataset(cfg).production_use.length / USE_CHUNK);
  return ["reference", "assets", "calibration_events", "certificates", "exception_records", "work_orders", ...Array.from({ length: n }, (_, i) => `production_use:${i}`), "corrective", "alerts", "audit", "ground_truth", "finalize"];
}

async function upsert(table: string, rows: unknown[], pk: string) {
  for (let i = 0; i < rows.length; i += 2500) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 2500), { onConflict: pk, ignoreDuplicates: true });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}
export async function startRun(cfg: GenConfig) {
  const existing: Record<string, number> = {};
  for (const table of ENTITY_TABLES) {
    const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    existing[table] = count ?? 0;
  }
  assertGenerationEmpty(existing);
  await db.from("generation_runs").update({ status: "FAILED", error: "Interrupted and superseded by a new run", finished_at: new Date().toISOString() }).eq("status", "RUNNING");
  const { data, error } = await db.from("generation_runs").insert({ seed: cfg.seed, scale: cfg.scale, generator_version: GENERATOR_VERSION, sim_start: cfg.simStart, sim_end: cfg.simEnd, status: "RUNNING" }).select("run_id").single();
  if (error) throw new Error(error.message);
  for (const [key, value] of [["generator_seed", cfg.seed], ["generation_scale", cfg.scale], ["sim_start", cfg.simStart], ["sim_end", cfg.simEnd], ["simulation_date", cfg.simEnd]] as const)
    await db.from("settings").upsert({ key, value, updated_by: "system:generator", updated_at: new Date().toISOString() });
  return { run_id: data.run_id as string, steps: stepsFor(cfg) };
}

export async function resumeRun() {
  const { data: latest, error } = await db.from("generation_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  const run = latest;
  if (!run) throw new Error("No interrupted generation run to resume.");
  if (run.status !== "RUNNING") throw new Error("The latest generation is completed; older interrupted runs cannot modify this dataset.");
  const steps = stepsFor({ seed: Number(run.seed), scale: run.scale, simStart: run.sim_start, simEnd: run.sim_end });
  const last = run.progress?.last_step as string | undefined;
  return { run_id: run.run_id as string, steps, startIndex: last ? steps.indexOf(last) + 1 : 0 };
}

export async function runStep(runId: string, step: string) {
  const { data: run } = await db.from("generation_runs").select("*").eq("run_id", runId).single();
  if (!run || run.status !== "RUNNING") throw new Error("Generation run is not running.");
  const cfg: GenConfig = { seed: Number(run.seed), scale: run.scale, simStart: run.sim_start, simEnd: run.sim_end };
  try {
    const ds = dataset(cfg);
    if (step === "reference") { await upsert("instrument_types", ds.instrument_types, "instrument_type_id"); await upsert("suppliers", ds.suppliers, "supplier_id"); await upsert("calibration_plans", ds.calibration_plans, "plan_id"); }
    else if (step === "assets") await upsert("assets", ds.assets, "asset_id");
    else if (step === "calibration_events") await upsert("calibration_events", ds.calibration_events, "calibration_id");
    else if (step === "certificates") await upsert("certificates", ds.certificates, "certificate_id");
    else if (step === "exception_records") await upsert("exception_records", ds.exception_records, "exception_id");
    else if (step === "work_orders") { await upsert("work_orders", ds.work_orders, "work_order_id"); await upsert("downtime_events", ds.downtime_events, "downtime_id"); }
    else if (step.startsWith("production_use:")) { const i = Number(step.split(":")[1]); await upsert("production_use", ds.production_use.slice(i * USE_CHUNK, (i + 1) * USE_CHUNK), "use_id"); }
    else if (step === "corrective") { await upsert("corrective_actions", ds.corrective_actions, "corrective_action_id"); await upsert("impact_assessments", ds.impact_assessments, "assessment_id"); }
    else if (step === "alerts") await upsert("alerts", ds.alerts, "alert_id");
    else if (step === "audit") { const { error } = await db.rpc("append_generation_history", { p_run_id: runId, p_audit: ds.audit_records, p_state: ds.state_history }); if (error) throw new Error(error.message); }
    else if (step === "ground_truth") await upsert("ground_truth_cases", ds.ground_truth_cases.map((g) => ({ ...g, generation_run_id: runId })), "case_id");
    else if (step === "finalize") {
      const expected = rowCounts(ds);
      const actual: Record<string, number> = {};
      for (const t of ENTITY_TABLES) { const { count } = await db.from(t).select("*", { count: "exact", head: true }); actual[t] = count ?? 0; }
      const mismatches = ENTITY_TABLES.filter((t) => actual[t] !== expected[t]);
      const sums = await checksums(ds);
      for (const k of ["AST", "SUP-L", "EXC", "ALR", "CA", "IA", "DT", "ATT"]) await db.from("id_counters").upsert({ prefix: k, value: k === "AST" ? ds.assets.length : 0 });
      const status = mismatches.length ? "FAILED" : "SUCCEEDED";
      await db.from("generation_runs").update({ status, row_counts: { expected, actual }, checksums: sums, finished_at: new Date().toISOString(), error: mismatches.length ? `Row count mismatch: ${mismatches.join(", ")}` : null }).eq("run_id", runId);
      return { done: true, status, actual, expected };
    } else throw new Error(`Unknown step ${step}`);
    await db.from("generation_runs").update({ progress: { last_step: step, at: new Date().toISOString() } }).eq("run_id", runId);
    return { done: false };
  } catch (e) {
    await db.from("generation_runs").update({ status: "FAILED", error: `${step}: ${(e as Error).message}`, finished_at: new Date().toISOString() }).eq("run_id", runId);
    throw e;
  }
}

const n = (x: unknown) => (x == null ? null : Number(x));
async function loadDetectorInput(): Promise<DetectorInput> {
  const simDate = await getSetting<string>("simulation_date", "2026-10-28");
  const [plans, assets, events, certificates, exceptions, uses, workOrders, impactAssessments] = await Promise.all([
    fetchAll<any>("calibration_plans"), fetchAll<any>("assets", "asset_id,instrument_type_id,lifecycle_status,retired_at"), // eslint-disable-line @typescript-eslint/no-explicit-any
    fetchAll<any>("calibration_events"), fetchAll<any>("certificates"), fetchAll<any>("exception_records"), // eslint-disable-line @typescript-eslint/no-explicit-any
    fetchAll<any>("production_use", "use_id,asset_id,used_at,production_line,exception_id,created_at"), // eslint-disable-line @typescript-eslint/no-explicit-any
    fetchAll<any>("work_orders", "work_order_id,asset_id,status,due_at,downtime_hours,created_at,started_at,completed_at"), fetchAll<any>("impact_assessments", "assessment_id,calibration_id"), // eslint-disable-line @typescript-eslint/no-explicit-any
  ]);
  const iso = (t: string | null) => (t ? new Date(t).toISOString().replace(".000Z", "Z") : t);
  return {
    simDate,
    plans: plans.map((p) => ({ ...p, tolerance: Number(p.tolerance) })),
    assets,
    events: events.map((e) => ({ ...e, tolerance_used: Number(e.tolerance_used), measured_value: n(e.measured_value), reference_value: n(e.reference_value) })),
    certificates,
    exceptions: exceptions.map((x) => ({ ...x, valid_from: iso(x.valid_from), valid_until: iso(x.valid_until) })),
    uses: uses.map((u) => ({ ...u, used_at: iso(u.used_at) })),
    workOrders, impactAssessments,
  };
}

/** Structural validation + compliance detection against live records. Optionally sync alerts. */
export async function runValidation(syncAlerts: boolean) {
  const { data: runRow } = await db.from("evaluation_runs").insert({ kind: "VALIDATION", status: "RUNNING", inputs: { syncAlerts } }).select("run_id").single();
  try {
    const inp = await loadDetectorInput();
    const [types, suppliers, certsAll, dts, gt] = await Promise.all([fetchAll<any>("instrument_types"), fetchAll<any>("suppliers"), fetchAll<any>("certificates"), fetchAll<any>("downtime_events"), fetchAll<any>("ground_truth_cases")]); // eslint-disable-line @typescript-eslint/no-explicit-any
    const assetIds = new Set(inp.assets.map((a) => a.asset_id));
    const evIds = new Set(inp.events.map((e) => e.calibration_id));
    const planIds = new Set(inp.plans.map((p) => p.plan_id));
    const supIds = new Set(suppliers.map((s) => s.supplier_id));
    const typeIds = new Set(types.map((t) => t.instrument_type_id));
    const issues: Issue[] = [
      ...duplicateIds(inp.assets, "asset_id", "assets"), ...duplicateIds(inp.uses, "use_id", "production_use"),
      ...badPattern(inp.assets, "asset_id", ID_PATTERNS.assets, "assets"), ...badPattern(inp.events, "calibration_id", ID_PATTERNS.calibration_events, "calibration_events"),
      ...badPattern(certsAll, "certificate_id", ID_PATTERNS.certificates, "certificates"), ...badPattern(inp.workOrders, "work_order_id", ID_PATTERNS.work_orders, "work_orders"),
      ...badPattern(inp.uses, "use_id", ID_PATTERNS.production_use, "production_use"),
      ...missingFks(inp.assets, "asset_id", "instrument_type_id", typeIds, "assets"),
      ...missingFks(inp.events, "calibration_id", "asset_id", assetIds, "calibration_events"), ...missingFks(inp.events, "calibration_id", "plan_id", planIds, "calibration_events"),
      ...missingFks(inp.events, "calibration_id", "supplier_id", supIds, "calibration_events", true),
      ...missingFks(certsAll, "certificate_id", "calibration_id", evIds, "certificates"), ...missingFks(certsAll, "certificate_id", "asset_id", assetIds, "certificates"),
      ...missingFks(inp.uses, "use_id", "asset_id", assetIds, "production_use"),
      ...invalidEnums(inp.events, "calibration_id", "event_status", ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "FAILED", "CANCELLED"], "calibration_events"),
      ...invalidEnums(inp.assets, "asset_id", "lifecycle_status", ["ACTIVE", "QUARANTINED", "RETIRED"], "assets"),
      ...dateOrder(inp.workOrders as any[], "work_order_id", "created_at", "started_at", "work_orders"), ...dateOrder(inp.workOrders as any[], "work_order_id", "started_at", "completed_at", "work_orders"), // eslint-disable-line @typescript-eslint/no-explicit-any
      ...dateOrder(certsAll, "certificate_id", "issue_date", "expiry_date", "certificates"),
      ...downtimeMismatch(inp.workOrders.map((w: any) => ({ work_order_id: w.work_order_id, downtime_hours: Number(w.downtime_hours) })), dts.map((d) => ({ ...d }))), // eslint-disable-line @typescript-eslint/no-explicit-any
      ...inp.events.filter((e) => (e.event_status === "COMPLETED" && e.result !== "PASS") || (e.event_status === "FAILED" && e.result !== "FAIL")).map((e) => ({ check: "LIFECYCLE_RESULT", table: "calibration_events", id: e.calibration_id, message: `status ${e.event_status} with result ${e.result}` })),
    ];
    const { findings, checked } = detect(inp);
    const gtKeys = new Set(gt.map((g) => `${g.issue_type}|${g.entity_type}|${g.entity_id}`));
    const expected = findings.filter((f) => gtKeys.has(`${f.issue_type}|${f.entity_type}|${f.entity_id}`));
    const unexpected = findings.filter((f) => !gtKeys.has(`${f.issue_type}|${f.entity_type}|${f.entity_id}`));
    const byIssue: Record<string, number> = {};
    for (const f of findings) byIssue[f.issue_type] = (byIssue[f.issue_type] ?? 0) + 1;
    const byCheck: Record<string, number> = {};
    for (const i of issues) byCheck[i.check] = (byCheck[i.check] ?? 0) + 1;
    let alertsCreated = 0;
    if (syncAlerts && findings.length) {
      const existing = await fetchAll<{ issue_type: string; related_entity_type: string; related_entity_id: string }>("alerts");
      const keys = new Set(existing.map((a) => `${a.issue_type}|${a.related_entity_type}|${a.related_entity_id}`));
      const ops: Op[] = [];
      for (const finding of findings) {
        if (keys.has(`${finding.issue_type}|${finding.entity_type}|${finding.entity_id}`)) continue;
        const id = `ALR-${pad(await nextId("ALR"))}-L`;
        const values = { alert_id: id, asset_id: finding.asset_id, related_entity_type: finding.entity_type, related_entity_id: finding.entity_id, issue_type: finding.issue_type, severity: finding.severity, rule_id: finding.rule_id, explanation: finding.explanation, details: finding.details };
        ops.push({ op: "insert", table: "alerts", values }, audit("alert", id, "CREATE", "system:detector", null, values), stateChange("alert", id, null, "OPEN", "system:detector"));
        alertsCreated++;
      }
      if (ops.length) await applyOps(ops);
    }
    const counts = { assets: inp.assets.length, calibration_events: inp.events.length, production_use: inp.uses.length, certificates: certsAll.length, work_orders: inp.workOrders.length, ground_truth_cases: gt.length };
    const summary = { counts, integrity: { total: issues.length, byCheck }, findings: { total: findings.length, byIssue, expectedAnomalies: expected.length, unexpected: unexpected.length }, alertsCreated, checked, status: issues.length === 0 ? "PASS" : "ISSUES_FOUND" };
    await db.from("evaluation_runs").update({ status: "SUCCEEDED", summary, metrics: { integrity_issues: issues.length }, finished_at: new Date().toISOString() }).eq("run_id", runRow.run_id);
    return { run_id: runRow.run_id, summary, issues: issues.slice(0, 2000), unexpected: unexpected.slice(0, 500) };
  } catch (e) {
    await db.from("evaluation_runs").update({ status: "FAILED", error: (e as Error).message, finished_at: new Date().toISOString() }).eq("run_id", runRow.run_id);
    throw e;
  }
}

export async function runEvaluation() {
  const { data: runRow } = await db.from("evaluation_runs").insert({ kind: "EVALUATION", status: "RUNNING" }).select("run_id").single();
  try {
    const inp = await loadDetectorInput();
    const live = detect(inp); // detector never sees ground truth
    const generation = await db.from("generation_runs").select("*").eq("status", "SUCCEEDED").order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (generation.error) throw new Error(generation.error.message);
    const baselineRun = generation.data;
    if (!baselineRun) throw new Error("A successful baseline generation is required for cohort evaluation.");
    const baseline = generate({ seed: Number(baselineRun.seed), scale: baselineRun.scale, simStart: baselineRun.sim_start, simEnd: baselineRun.sim_end });
    const { findings, checked } = detect(baselineInput(inp, baseline, baselineRun.finished_at));
    const gt = (await fetchAll<any>("ground_truth_cases")).filter((row) => row.generation_run_id === baselineRun.run_id); // eslint-disable-line @typescript-eslint/no-explicit-any
    const result = compare(findings, gt, checked);
    const fk = new Set(findings.map((f) => `${f.issue_type}|${f.entity_type}|${f.entity_id}`));
    const scenarios = ["DUE_DATE_PLAN_MISMATCH", "EXPIRED_USE_WITHOUT_EXCEPTION", "CERTIFICATE_ASSET_MISMATCH", "IMPACT_ASSESSMENT_MISSING"].map((it) => {
      const cases = gt.filter((g) => g.issue_type === it);
      const detected = cases.filter((g) => fk.has(`${g.issue_type}|${g.entity_type}|${g.entity_id}`)).length;
      return { issue_type: it, expected: cases.length, detected, pass: cases.length > 0 && detected === cases.length, sample: cases.slice(0, 3).map((c) => c.entity_id) };
    });
    const { data: gen } = await db.from("generation_runs").select("run_id,generator_version").eq("status", "SUCCEEDED").order("started_at", { ascending: false }).limit(1);
    const metrics = { overall: result.overall, perIssue: result.perIssue, scenarios, scope: "baseline identities at baseline simulation date" };
    const baselineKeys = new Set(findings.map((f) => `${f.issue_type}|${f.entity_type}|${f.entity_id}`));
    const operationalFindings = live.findings.filter((f) => !baselineKeys.has(`${f.issue_type}|${f.entity_type}|${f.entity_id}`));
    const summary = { missed: result.missed, unexpected: result.unexpected, gt_cases: gt.length, findings: findings.length, live_findings: live.findings.length, operationalFindings, baseline_run_id: baselineRun.run_id };
    await db.from("evaluation_runs").update({ status: "SUCCEEDED", ground_truth_version: gen?.[0] ? `${gen[0].generator_version}/${gen[0].run_id}` : null, metrics, summary, finished_at: new Date().toISOString() }).eq("run_id", runRow.run_id);
    return { run_id: runRow.run_id, metrics, missed: result.missed, unexpected: result.unexpected, summary };
  } catch (e) {
    await db.from("evaluation_runs").update({ status: "FAILED", error: (e as Error).message, finished_at: new Date().toISOString() }).eq("run_id", runRow.run_id);
    throw e;
  }
}

export async function runReproducibility() {
  const { data: runRow } = await db.from("evaluation_runs").insert({ kind: "REPRODUCIBILITY", status: "RUNNING" }).select("run_id").single();
  try {
    const { data: gen } = await db.from("generation_runs").select("*").eq("status", "SUCCEEDED").order("started_at", { ascending: false }).limit(1);
    const g = gen?.[0];
    const cfg: GenConfig = g ? { seed: Number(g.seed), scale: g.scale, simStart: g.sim_start, simEnd: g.sim_end } : { seed: await getSetting("generator_seed", 20261022), scale: "starter", simStart: "2025-10-28", simEnd: "2026-10-28" };
    const a = generate(cfg), b = generate(cfg);
    const [ca, cb] = await Promise.all([checksums(a), checksums(b)]);
    const ra = rowCounts(a), rb = rowCounts(b);
    const legacy: Record<string, string> = {};
    for (const table of ENTITY_TABLES) legacy[table] = await sha256((a[table] as unknown[]).map((row) => JSON.stringify(row, Object.keys(row as object).sort())).join("\n"));
    const tables = ENTITY_TABLES.map((t) => ({ table: t, rowsA: ra[t], rowsB: rb[t], checksumA: ca[t], checksumB: cb[t], matchesStored: g ? g.checksums?.[t] === legacy[t] : null, identical: ra[t] === rb[t] && ca[t] === cb[t] }));
    const repeatable = tables.every((t) => t.identical);
    const storedAgreement = g ? tables.every((t) => t.matchesStored) : null;
    const identical = repeatable && storedAgreement !== false;
    const summary = { config: cfg, generator_version: GENERATOR_VERSION, recorded_generator_version: g?.generator_version, identical, repeatable, checksum_version: CHECKSUM_VERSION, stored_checksum_version: "1-top-level-key-filter", storedAgreement: g ? tables.every((t) => t.matchesStored) : null, persisted_baseline_verified: false, tables, gtA: a.ground_truth_cases.length, gtB: b.ground_truth_cases.length, comparedToRun: g?.run_id ?? null };
    await db.from("evaluation_runs").update({ status: "SUCCEEDED", inputs: cfg, summary, metrics: { identical }, finished_at: new Date().toISOString() }).eq("run_id", runRow.run_id);
    return summary;
  } catch (e) {
    await db.from("evaluation_runs").update({ status: "FAILED", error: (e as Error).message, finished_at: new Date().toISOString() }).eq("run_id", runRow.run_id);
    throw e;
  }
}

export async function exportTable(table: string, format: "csv" | "json" | "sql") {
  const allowed = [...ENTITY_TABLES, "use_attempts", "settings_history", "alert_notes", "evaluation_runs", "generation_runs"];
  if (!allowed.includes(table as never)) throw new Error("Table not exportable");
  const pk = { audit_records: "audit_id", state_history: "id", alert_notes: "note_id", settings_history: "id", evaluation_runs: "run_id", generation_runs: "run_id" }[table as string];
  const rows = await fetchAll<Record<string, unknown>>(table, "*", pk ?? undefined);
  const limit = await getSetting<number>("export_row_limit", 100000);
  const exported = rows.slice(0, limit);
  return { rows: exported.length, total: rows.length, truncated: rows.length > limit, content: serialize(table, exported, format) };
}

export function serialize(table: string, rows: Record<string, unknown>[], format: "csv" | "json" | "sql") {
  if (format === "json") return JSON.stringify(rows, null, 1);
  const cols = rows[0] ? Object.keys(rows[0]) : [];
  const val = (v: unknown) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
  if (format === "csv") return [cols.join(","), ...rows.map((r) => cols.map((c) => { const s = val(r[c]); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(","))].join("\n");
  const lit = (v: unknown) => (v == null ? "NULL" : typeof v === "number" || typeof v === "boolean" ? String(v) : `'${val(v).replace(/'/g, "''")}'`);
  return rows.map((r) => `INSERT INTO public.${table} (${cols.join(", ")}) VALUES (${cols.map((c) => lit(r[c])).join(", ")});`).join("\n");
}

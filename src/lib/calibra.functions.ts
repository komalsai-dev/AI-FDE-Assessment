import { createServerFn } from "@tanstack/react-start";
import type { Role } from "./roles";
import type { GenConfig } from "@/data/generator";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const json = (x: unknown): Json => JSON.parse(JSON.stringify(x));

/**
 * Prototype security model: synthetic data is publicly readable; every write goes through these
 * server functions, which enforce the role permission matrix server-side. Identities are demo
 * identities (not authenticated users) — the UI labels the environment as a prototype.
 */
export const runActionFn = createServerFn({ method: "POST" })
  .validator((d: { action: string; payload: Record<string, unknown>; role: Role; actor: string; requestId?: string }) => d)
  .handler(async ({ data }) => {
    const { runAction } = await import("./actions.server");
    try {
      return json(await runAction(data.action, data.payload, data.role, data.actor || "demo.user", data.requestId));
    } catch (e) {
      console.error(JSON.stringify({ level: "error", action: data.action, message: (e as Error).message }));
      return json({ ok: false, error: (e as Error).message });
    }
  });

const adminOnly = (role: Role) => { if (role !== "ADMIN") throw new Error("Only the OT/IT Administrator can run data generation."); };

export const startGenerationFn = createServerFn({ method: "POST" })
  .validator((d: { cfg: GenConfig; role: Role }) => d)
  .handler(async ({ data }) => {
    adminOnly(data.role);
    const { startRun } = await import("./gen.server");
    return json(await startRun(data.cfg)) as Json;
  });

export const generationStepFn = createServerFn({ method: "POST" })
  .validator((d: { runId: string; step: string; role: Role }) => d)
  .handler(async ({ data }) => {
    adminOnly(data.role);
    const { runStep } = await import("./gen.server");
    return json(await runStep(data.runId, data.step)) as Json;
  });

export const validationFn = createServerFn({ method: "POST" })
  .validator((d: { syncAlerts: boolean }) => d)
  .handler(async ({ data }): Promise<Json> => json(await (await import("./gen.server")).runValidation(data.syncAlerts)));

export const evaluationFn = createServerFn({ method: "POST" }).handler(async (): Promise<Json> => json(await (await import("./gen.server")).runEvaluation()));
export const reproducibilityFn = createServerFn({ method: "POST" }).handler(async (): Promise<Json> => json(await (await import("./gen.server")).runReproducibility()));

export const exportFn = createServerFn({ method: "POST" })
  .validator((d: { table: string; format: "csv" | "json" | "sql" }) => d)
  .handler(async ({ data }) => (await import("./gen.server")).exportTable(data.table, data.format));

export const resumeGenerationFn = createServerFn({ method: "POST" })
  .validator((d: { role: Role }) => d)
  .handler(async ({ data }) => {
    adminOnly(data.role);
    return json(await (await import("./gen.server")).resumeRun()) as Json;
  });

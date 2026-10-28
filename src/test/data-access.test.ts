import { describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ calls: [] as { method: string; args: unknown[] }[], total: 100001 }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  let range: [number, number] = [0, 999];
  const query: Record<string, unknown> = {};
  for (const method of ["select", "order", "eq", "range"]) query[method] = (...args: unknown[]) => { fake.calls.push({ method, args }); if (method === "range") range = [Number(args[0]), Number(args[1])]; return query; };
  query.then = (resolve: (value: unknown) => unknown) => resolve({ error: null, data: Array.from({ length: Math.max(0, Math.min(range[1] + 1, fake.total) - range[0]) }, (_, i) => ({ use_id: `USE-${range[0] + i}` })) });
  return query;
} } }));
import { allRows } from "@/lib/data";
describe("paginated exports", () => {
  it("exports 100001 rows without silently dropping the operational addition", async () => {
    fake.calls = [];
    const data = await allRows("production_use", undefined, "*", "used_at", Infinity, false);
    expect(data).toHaveLength(100001);
    expect(new Set(data.map((row) => row.use_id)).size).toBe(100001);
    expect(fake.calls.filter((call) => call.method === "order").slice(0, 2)).toEqual([{ method: "order", args: ["used_at", { ascending: false }] }, { method: "order", args: ["use_id", { ascending: false }] }]);
  });
});
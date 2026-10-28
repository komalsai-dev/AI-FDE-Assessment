import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ one: vi.fn(), rpc: vi.fn(), receipts: new Map<string, unknown>() }));
vi.mock("@/lib/db.server", () => ({
  one: mock.one, getSetting: vi.fn().mockResolvedValue("2026-10-28"), nextId: vi.fn().mockResolvedValue(2001), pad: (n: number) => String(n).padStart(6, "0"),
  audit: (entity_type: string, entity_id: string) => ({ op: "insert", table: "audit_records", values: { entity_type, entity_id } }),
  stateChange: () => ({ op: "insert", table: "state_history", values: {} }),
  applyOps: async (ops: { table: string; values: Record<string, unknown> }[]) => {
    mock.rpc(ops);
    const receipt = ops.find((op) => op.table === "action_receipts");
    if (receipt) mock.receipts.set(String(receipt.values.request_id), receipt.values);
  },
  db: { from: () => ({ select: () => ({ eq: (_key: string, id: string) => ({ maybeSingle: async () => ({ data: mock.receipts.get(id) ?? null, error: null }) }) }) }) },
}));
import { runAction } from "@/lib/actions.server";
describe("audited action regression", () => {
  beforeEach(() => { mock.rpc.mockClear(); mock.receipts.clear(); mock.one.mockReset(); });
  it("retrying the same request returns the original result without another write", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const payload = { asset_name: "Audit fixture", instrument_type_id: "PRS", location: "Plant A" };
    const first = await runAction("asset.create", payload, "ADMIN", "fixture", id);
    const again = await runAction("asset.create", payload, "ADMIN", "fixture", id);
    expect(again).toEqual(first); expect(mock.rpc).toHaveBeenCalledTimes(1);
    const call = mock.rpc.mock.calls[0];
    if (!call) throw new Error("Expected transaction");
    expect(call[0].map((op: { table: string }) => op.table)).toEqual(["assets", "audit_records", "state_history", "action_receipts"]);
  });
  it("rejects invalid measurements before any write", async () => {
    mock.one.mockResolvedValue({ event_status: "IN_PROGRESS" });
    await expect(runAction("cal.complete", { calibration_id: "CAL-X", calibration_date: "2026-10-28", measured_value: "bad", reference_value: 10 }, "ADMIN", "fixture")).rejects.toThrow("finite number");
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("rejects mismatched work-order ownership before allocating a record", async () => {
    mock.one.mockResolvedValue({ asset_id: "AST-000002" });
    await expect(runAction("wo.create", { asset_id: "AST-000001", calibration_id: "CAL-X", work_order_type: "CALIBRATION", priority: "HIGH", due_at: "2026-10-29" }, "ADMIN", "fixture")).rejects.toThrow("must match");
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("operator cannot create assets through the action handler", async () => {
    await expect(runAction("asset.create", {}, "OPERATOR", "fixture")).rejects.toThrow("not permitted");
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("rejects reuse of a receipt for different input", async () => {
    const id = "22222222-2222-4222-8222-222222222222";
    await runAction("asset.create", { asset_name: "One", instrument_type_id: "PRS", location: "Plant A" }, "ADMIN", "fixture", id);
    await expect(runAction("asset.create", { asset_name: "Two", instrument_type_id: "PRS", location: "Plant A" }, "ADMIN", "fixture", id)).rejects.toThrow("different input");
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });
});
import { useQuery } from "@tanstack/react-query";
import { rows } from "./data";
import { LINES, LOCATIONS } from "@/data/referenceData";

export function useLookups() {
  return useQuery({
    queryKey: ["lookups"],
    queryFn: async () => {
      const [types, suppliers, plans] = await Promise.all([rows("instrument_types", (q) => q.order("type_name")), rows("suppliers", (q) => q.order("supplier_id")), rows("calibration_plans", (q) => q.order("plan_id"))]);
      return {
        types, suppliers, plans,
        typeOptions: types.map((t) => ({ value: t.instrument_type_id, label: `${t.type_name} (${t.measurement_unit})` })),
        supplierOptions: suppliers.map((s) => ({ value: s.supplier_id, label: `${s.supplier_name} — ${s.approval_status}` })),
        eligibleSupplierOptions: suppliers.filter((s) => ["APPROVED", "CONDITIONAL"].includes(s.approval_status)).map((s) => ({ value: s.supplier_id, label: `${s.supplier_name} — ${s.approval_status}` })),
      };
    },
    staleTime: 60_000,
  });
}
export const LINE_OPTIONS = [...LINES];
export const LOCATION_OPTIONS = [...LOCATIONS];
export const looseSearch = (s: Record<string, unknown>) => s as Record<string, string | undefined>;

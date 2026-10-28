export const ROLES = ["OPERATOR", "MAINTENANCE", "QUALITY", "PLANNER", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = { OPERATOR: "Plant Operator", MAINTENANCE: "Maintenance Engineer", QUALITY: "Quality Engineer", PLANNER: "Production Planner", ADMIN: "OT/IT Administrator" };

/** Action-prefix permissions, enforced on the server for every write. */
export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  OPERATOR: ["use.request"],
  MAINTENANCE: ["cal.", "wo.", "asset.create", "asset.update", "ca.update", "ca.transition", "alert.note", "alert.assign", "use.request", "exc.create"],
  QUALITY: ["cert.", "alert.", "ca.", "ia.", "exc.", "asset.release", "asset.retire", "supplier.", "use.request"],
  PLANNER: ["wo.create", "wo.update", "cal.schedule", "cal.reschedule", "use.request"],
  ADMIN: ["*"],
};

export function can(role: Role, action: string) {
  const p = ROLE_PERMISSIONS[role];
  return p.includes("*") || p.some((x) => action.startsWith(x));
}

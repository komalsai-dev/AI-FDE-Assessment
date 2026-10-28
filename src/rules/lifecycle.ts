export const TRANSITIONS = {
  calibration: {
    SCHEDULED: ["IN_PROGRESS", "CANCELLED"],
    IN_PROGRESS: ["COMPLETED", "FAILED", "CANCELLED"],
    COMPLETED: [],
    FAILED: [],
    CANCELLED: [],
  },
  work_order: {
    OPEN: ["IN_PROGRESS", "BLOCKED", "CANCELLED"],
    IN_PROGRESS: ["COMPLETED", "BLOCKED", "CANCELLED"],
    BLOCKED: ["IN_PROGRESS", "CANCELLED"],
    COMPLETED: [],
    CANCELLED: [],
  },
  alert: {
    OPEN: ["ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED"],
    ACKNOWLEDGED: ["IN_PROGRESS", "RESOLVED"],
    IN_PROGRESS: ["RESOLVED"],
    RESOLVED: ["OPEN"],
  },
  corrective_action: {
    OPEN: ["IN_PROGRESS", "CANCELLED"],
    IN_PROGRESS: ["PENDING_APPROVAL", "CANCELLED"],
    PENDING_APPROVAL: ["COMPLETED", "IN_PROGRESS"],
    COMPLETED: [],
    CANCELLED: [],
  },
  impact_assessment: { REQUIRED: ["IN_PROGRESS"], IN_PROGRESS: ["COMPLETED"], COMPLETED: [] },
  exception: {
    PENDING: ["APPROVED", "REJECTED"],
    APPROVED: ["REVOKED", "EXPIRED"],
    REJECTED: [],
    EXPIRED: [],
    REVOKED: [],
  },
  asset: { ACTIVE: ["QUARANTINED", "RETIRED"], QUARANTINED: ["ACTIVE", "RETIRED"], RETIRED: [] },
} as const;

export type Machine = keyof typeof TRANSITIONS;

export function canTransition(machine: Machine, from: string, to: string): boolean {
  const m = TRANSITIONS[machine] as Record<string, readonly string[]>;
  return (m[from] ?? []).includes(to);
}

export function assertTransition(machine: Machine, from: string, to: string): void {
  if (!canTransition(machine, from, to)) throw new Error(`INVALID_TRANSITION: ${machine} ${from} → ${to} is not allowed`);
}

/** Transitions that must carry a reason. */
export const REASON_REQUIRED = new Set(["work_order:CANCELLED", "calibration:CANCELLED", "alert:OPEN", "exception:REVOKED", "exception:REJECTED", "asset:RETIRED", "asset:QUARANTINED", "asset:ACTIVE"]);

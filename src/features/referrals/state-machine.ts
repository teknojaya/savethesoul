export type ReferralStatus =
  | "REQUESTED"
  | "ACKNOWLEDGED"
  | "SCHEDULED"
  | "COMPLETED"
  | "DECLINED"
  | "CANCELLED"
  | "UNABLE_TO_CONTACT";

export type ReferralActor = "PATIENT" | "CLINICIAN" | "SIMULATION";

/** REQUESTED → ACKNOWLEDGED → SCHEDULED → COMPLETED, with exit states. */
export const TRANSITIONS: Record<ReferralStatus, ReferralStatus[]> = {
  REQUESTED: ["ACKNOWLEDGED", "DECLINED", "CANCELLED", "UNABLE_TO_CONTACT"],
  ACKNOWLEDGED: ["SCHEDULED", "DECLINED", "CANCELLED", "UNABLE_TO_CONTACT"],
  SCHEDULED: ["COMPLETED", "CANCELLED", "UNABLE_TO_CONTACT"],
  UNABLE_TO_CONTACT: ["ACKNOWLEDGED", "CANCELLED"],
  COMPLETED: [],
  DECLINED: [],
  CANCELLED: [],
};

/** Which actor may move a referral INTO a given status. */
const ALLOWED_ACTORS: Record<ReferralStatus, ReferralActor[]> = {
  REQUESTED: [],
  ACKNOWLEDGED: ["CLINICIAN", "SIMULATION"],
  SCHEDULED: ["CLINICIAN"],
  COMPLETED: ["CLINICIAN"],
  DECLINED: ["CLINICIAN"],
  UNABLE_TO_CONTACT: ["CLINICIAN"],
  CANCELLED: ["PATIENT", "CLINICIAN"],
};

export const TERMINAL: ReadonlySet<ReferralStatus> = new Set(["COMPLETED", "DECLINED", "CANCELLED"]);

export function canTransition(from: ReferralStatus, to: ReferralStatus, actor: ReferralActor): boolean {
  return TRANSITIONS[from].includes(to) && ALLOWED_ACTORS[to].includes(actor);
}

export function assertTransition(from: ReferralStatus, to: ReferralStatus, actor: ReferralActor) {
  if (!TRANSITIONS[from].includes(to)) {
    return { ok: false as const, reason: `A referral cannot move from ${from} to ${to}.` };
  }
  if (!ALLOWED_ACTORS[to].includes(actor)) {
    return { ok: false as const, reason: `${actor.toLowerCase()} cannot set a referral to ${to}.` };
  }
  return { ok: true as const };
}

export const STATUS_LABEL: Record<ReferralStatus, string> = {
  REQUESTED: "Requested",
  ACKNOWLEDGED: "Acknowledged",
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  DECLINED: "Declined",
  CANCELLED: "Cancelled",
  UNABLE_TO_CONTACT: "Unable to contact",
};

/** Whether this status counts as a confirmed human hand-off (a person has engaged). */
export function isConfirmedHandoff(status: ReferralStatus): boolean {
  return status === "ACKNOWLEDGED" || status === "SCHEDULED" || status === "COMPLETED";
}

/**
 * Human-led emergency response workflow (SIMULATED in the prototype). Pure and unit-tested.
 * No state means a real hospital, responder or family member was contacted.
 */
export const EMERGENCY_STATUSES = [
  "DETECTED",
  "REVIEW_REQUESTED",
  "ACKNOWLEDGED",
  "CONTACT_ATTEMPTED",
  "ASSISTANCE_ARRANGED",
  "RESOLVED",
  "FAILED",
  "CANCELLED",
  "UNABLE_TO_CONTACT",
] as const;
export type EmergencyStatus = (typeof EMERGENCY_STATUSES)[number];

export const TERMINAL: ReadonlySet<EmergencyStatus> = new Set(["RESOLVED", "FAILED", "CANCELLED"]);

const NEXT: Record<EmergencyStatus, EmergencyStatus[]> = {
  DETECTED: ["REVIEW_REQUESTED", "CANCELLED"],
  REVIEW_REQUESTED: ["ACKNOWLEDGED", "CANCELLED", "FAILED"],
  ACKNOWLEDGED: ["CONTACT_ATTEMPTED", "CANCELLED", "FAILED"],
  CONTACT_ATTEMPTED: ["ASSISTANCE_ARRANGED", "UNABLE_TO_CONTACT", "FAILED"],
  UNABLE_TO_CONTACT: ["CONTACT_ATTEMPTED", "FAILED", "RESOLVED"],
  ASSISTANCE_ARRANGED: ["RESOLVED", "FAILED"],
  RESOLVED: [],
  FAILED: [],
  CANCELLED: [],
};

export function allowedNext(from: EmergencyStatus): EmergencyStatus[] {
  return NEXT[from];
}

export function canTransition(from: EmergencyStatus, to: EmergencyStatus): boolean {
  return NEXT[from].includes(to);
}

/** Plain-language labels; every one says "simulated" where an outside party would be involved. */
export const STATUS_LABEL: Record<EmergencyStatus, string> = {
  DETECTED: "Concern detected",
  REVIEW_REQUESTED: "Awaiting human review",
  ACKNOWLEDGED: "Acknowledged",
  CONTACT_ATTEMPTED: "Contact attempted",
  ASSISTANCE_ARRANGED: "Assistance arranged",
  RESOLVED: "Resolved",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  UNABLE_TO_CONTACT: "Unable to contact",
};

export const ACTION_LABEL: Partial<Record<EmergencyStatus, string>> = {
  REVIEW_REQUESTED: "Request human review",
  ACKNOWLEDGED: "Acknowledge case",
  CONTACT_ATTEMPTED: "Record contact attempt",
  ASSISTANCE_ARRANGED: "Record assistance arranged",
  UNABLE_TO_CONTACT: "Record unable to contact",
  RESOLVED: "Resolve case",
  FAILED: "Mark as failed",
  CANCELLED: "Cancel case",
};

export const SIMULATED_BANNER = "SIMULATED EMERGENCY ALERT — No real hospital or emergency responder has been notified.";

/**
 * Consent model. Pure functions so the rules can be unit-tested and reused by a
 * future React Native client or a different backend.
 */

export const POLICY_VERSION = "2026-11-v1";

export const CLINICIAN_SHARE_CATEGORIES = {
  WHO5_HISTORY: "WHO-5 wellbeing scores and dates",
  MOOD_TRENDS: "Mood check-in averages",
  SLEEP_STRESS: "Sleep and stress check-in averages",
  FUNCTIONING: "Self-reported daily functioning",
  GOALS: "Your wellbeing goals",
  PHYSICAL_HEALTH_CONTEXT: "Physical health context you added",
  PATIENT_NOTE: "A personal note you write for the clinician",
  REPORTED_CONCERNS: "What you're finding difficult (areas, how long, how often, effect on daily life)",
  REFERRAL_HISTORY: "Your referral and follow-up history",
  CONVERSATIONS: "Your Sakinah conversations (full chat history, read-only)",
} as const;

/** Areas a patient can choose to describe (patient-reported; never inferred by the AI). */
export const CONCERN_AREAS = {
  STRESS: "Stress or pressure",
  LOW_MOOD: "Low mood or loss of interest",
  WORRY: "Worry, anxiety or panic",
  SLEEP: "Sleep",
  GRIEF: "Grief or loss",
  RELATIONSHIPS: "Relationships or family",
  WORK_STUDY: "Work or study",
  LONELINESS: "Loneliness or adjusting to a new place",
  OTHER: "Something else",
} as const;
export const CONCERN_DURATION = { UNDER_2_WEEKS: "Less than 2 weeks", "2_TO_4_WEEKS": "2–4 weeks", "1_TO_3_MONTHS": "1–3 months", OVER_3_MONTHS: "More than 3 months" } as const;
export const CONCERN_FREQUENCY = { SOMETIMES: "Some days", OFTEN: "More than half the days", MOST_DAYS: "Nearly every day" } as const;
export const CONCERN_IMPACT = { NONE: "Not much", SOME: "Somewhat", A_LOT: "A lot" } as const;
export const HELP_WANTED = { TALK_THERAPY: "Talking therapy", ASSESSMENT: "A professional assessment", MEDICATION_REVIEW: "A medication review with a doctor", NOT_SURE: "Not sure yet" } as const;
export type ClinicianShareCategory = keyof typeof CLINICIAN_SHARE_CATEGORIES;

export const CONTACT_SHARE_CATEGORIES = {
  CHECK_IN_REQUEST: "Ask them to check in with you",
  GENERAL_UPDATE: "A general update that you're going through a hard time",
  APPOINTMENT_SUPPORT: "That you have a care appointment and may want support",
  SAFETY_PLAN_SUPPORT: "That you've named them in your safety plan",
} as const;
export type ContactShareCategory = keyof typeof CONTACT_SHARE_CATEGORIES;

export interface ConsentLike {
  scope: string;
  granteeType: string;
  granteeId: string | null;
  categories: string[];
  revokedAt: Date | null;
}

export function isActive(c: ConsentLike): boolean {
  return c.revokedAt === null;
}

/** Returns the active consent that covers sharing `category` with a grantee, or null. */
export function findCoveringConsent<T extends ConsentLike>(
  consents: T[],
  scope: string,
  granteeType: string,
  granteeId: string,
  category?: string,
): T | null {
  return (
    consents.find(
      (c) =>
        isActive(c) &&
        c.scope === scope &&
        c.granteeType === granteeType &&
        c.granteeId === granteeId &&
        (!category || c.categories.includes(category)),
    ) ?? null
  );
}

// ───────────── Trusted contact notification safeguards ─────────────

export interface ContactLike {
  id: string;
  canReceiveUpdates: boolean;
  canReceiveSafetyAlerts: boolean;
  sharedCategories: string[];
  revokedAt: Date | null;
  recipientVerified: boolean;
}

export type NotificationDecision =
  | { allowed: true; delivery: "SIMULATED" }
  | { allowed: false; reason: string };

/**
 * Decides whether a notification to a trusted contact may be (simulated-)sent.
 * Real delivery is never performed by the prototype: even when every check passes,
 * delivery is SIMULATED. Real delivery would additionally require a verified recipient
 * and an approved escalation process (see docs/AI_SAFETY.md).
 */
export function decideContactNotification(input: {
  contact: ContactLike;
  consents: ConsentLike[];
  kind: "ORDINARY_UPDATE" | "SAFETY_ALERT";
  category: string;
  initiatedByPatient: boolean;
}): NotificationDecision {
  const { contact, consents, kind, category, initiatedByPatient } = input;
  if (!initiatedByPatient) {
    return { allowed: false, reason: "Notifications to trusted contacts are only sent when you choose to send them." };
  }
  if (contact.revokedAt) return { allowed: false, reason: "This contact has been removed." };
  if (kind === "ORDINARY_UPDATE" && !contact.canReceiveUpdates) {
    return { allowed: false, reason: "This contact is not permitted to receive updates." };
  }
  if (kind === "SAFETY_ALERT" && !contact.canReceiveSafetyAlerts) {
    return { allowed: false, reason: "This contact is not permitted to receive safety messages." };
  }
  if (!contact.sharedCategories.includes(category)) {
    return { allowed: false, reason: "You haven't allowed this type of information to be shared with this contact." };
  }
  const consent = findCoveringConsent(consents, "TRUSTED_CONTACT_SHARING", "TRUSTED_CONTACT", contact.id, category);
  if (!consent) {
    return { allowed: false, reason: "Sharing consent for this contact is not active (it may have been revoked)." };
  }
  return { allowed: true, delivery: "SIMULATED" };
}

export function buildContactMessage(category: string, patientFirstName: string, contactName: string): string {
  switch (category) {
    case "CHECK_IN_REQUEST":
      return `Hi ${contactName}, ${patientFirstName} asked SaveTheSoul to let you know they'd appreciate you checking in with them when you can.`;
    case "GENERAL_UPDATE":
      return `Hi ${contactName}, ${patientFirstName} wanted you to know they're going through a difficult time and would value your support.`;
    case "APPOINTMENT_SUPPORT":
      return `Hi ${contactName}, ${patientFirstName} has an upcoming care appointment and asked us to let you know in case you can offer support.`;
    case "SAFETY_PLAN_SUPPORT":
      return `Hi ${contactName}, ${patientFirstName} has named you as a support person in their personal safety plan and would like you to reach out to them now. If you believe they are in immediate danger, call 999 or 998.`;
    default:
      return `Hi ${contactName}, ${patientFirstName} asked SaveTheSoul to send you a message.`;
  }
}

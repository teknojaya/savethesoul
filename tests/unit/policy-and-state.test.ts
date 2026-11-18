import { describe, expect, it } from "vitest";
import { assertTransition, canTransition, isConfirmedHandoff, TRANSITIONS, type ReferralStatus } from "@/features/referrals/state-machine";
import { decideContactNotification, findCoveringConsent, buildContactMessage } from "@/features/consent/policy";
import { decrypt, encrypt, encryptJson, decryptJson, sha256 } from "@/lib/crypto";
import { RegisterSchema, Who5Schema, TrustedContactSchema, SendMessageSchema, ReferralTransitionSchema } from "@/lib/validation/schemas";

describe("Referral state machine", () => {
  it("allows the happy path REQUESTED → ACKNOWLEDGED → SCHEDULED → COMPLETED by a clinician", () => {
    expect(canTransition("REQUESTED", "ACKNOWLEDGED", "CLINICIAN")).toBe(true);
    expect(canTransition("ACKNOWLEDGED", "SCHEDULED", "CLINICIAN")).toBe(true);
    expect(canTransition("SCHEDULED", "COMPLETED", "CLINICIAN")).toBe(true);
  });

  it("forbids skipping steps", () => {
    expect(canTransition("REQUESTED", "COMPLETED", "CLINICIAN")).toBe(false);
    expect(canTransition("REQUESTED", "SCHEDULED", "CLINICIAN")).toBe(false);
  });

  it("treats COMPLETED, DECLINED and CANCELLED as terminal", () => {
    for (const s of ["COMPLETED", "DECLINED", "CANCELLED"] as ReferralStatus[]) expect(TRANSITIONS[s]).toEqual([]);
  });

  it("lets patients cancel but not acknowledge, schedule or complete", () => {
    expect(canTransition("REQUESTED", "CANCELLED", "PATIENT")).toBe(true);
    expect(canTransition("REQUESTED", "ACKNOWLEDGED", "PATIENT")).toBe(false);
    expect(canTransition("ACKNOWLEDGED", "SCHEDULED", "PATIENT")).toBe(false);
    expect(canTransition("SCHEDULED", "COMPLETED", "PATIENT")).toBe(false);
  });

  it("allows simulation to acknowledge only", () => {
    expect(canTransition("REQUESTED", "ACKNOWLEDGED", "SIMULATION")).toBe(true);
    expect(canTransition("ACKNOWLEDGED", "SCHEDULED", "SIMULATION")).toBe(false);
    expect(canTransition("SCHEDULED", "COMPLETED", "SIMULATION")).toBe(false);
  });

  it("supports UNABLE_TO_CONTACT with retry", () => {
    expect(canTransition("ACKNOWLEDGED", "UNABLE_TO_CONTACT", "CLINICIAN")).toBe(true);
    expect(canTransition("UNABLE_TO_CONTACT", "ACKNOWLEDGED", "CLINICIAN")).toBe(true);
  });

  it("explains rejected transitions", () => {
    expect(assertTransition("COMPLETED", "ACKNOWLEDGED", "CLINICIAN")).toMatchObject({ ok: false });
    expect(assertTransition("REQUESTED", "ACKNOWLEDGED", "PATIENT")).toMatchObject({ ok: false, reason: expect.stringMatching(/patient/) });
  });

  it("counts only acknowledged/scheduled/completed as confirmed hand-offs", () => {
    expect(isConfirmedHandoff("REQUESTED")).toBe(false);
    expect(isConfirmedHandoff("ACKNOWLEDGED")).toBe(true);
    expect(isConfirmedHandoff("UNABLE_TO_CONTACT")).toBe(false);
  });
});

describe("Consent & simulated-notification safeguards", () => {
  const contact = {
    id: "c1",
    canReceiveUpdates: true,
    canReceiveSafetyAlerts: false,
    sharedCategories: ["CHECK_IN_REQUEST"],
    revokedAt: null,
    recipientVerified: false,
  };
  const active = { scope: "TRUSTED_CONTACT_SHARING", granteeType: "TRUSTED_CONTACT", granteeId: "c1", categories: ["CHECK_IN_REQUEST"], revokedAt: null };

  it("allows a permitted ordinary update — but only as SIMULATED delivery", () => {
    expect(
      decideContactNotification({ contact, consents: [active], kind: "ORDINARY_UPDATE", category: "CHECK_IN_REQUEST", initiatedByPatient: true }),
    ).toEqual({ allowed: true, delivery: "SIMULATED" });
  });

  it("blocks once consent is revoked", () => {
    const revoked = { ...active, revokedAt: new Date() };
    const d = decideContactNotification({ contact, consents: [revoked], kind: "ORDINARY_UPDATE", category: "CHECK_IN_REQUEST", initiatedByPatient: true });
    expect(d).toMatchObject({ allowed: false, reason: expect.stringMatching(/revoked|not active/) });
  });

  it("blocks categories that were not granted", () => {
    expect(
      decideContactNotification({ contact, consents: [active], kind: "ORDINARY_UPDATE", category: "GENERAL_UPDATE", initiatedByPatient: true }).allowed,
    ).toBe(false);
  });

  it("blocks safety messages when the contact may not receive them", () => {
    expect(
      decideContactNotification({ contact, consents: [active], kind: "SAFETY_ALERT", category: "CHECK_IN_REQUEST", initiatedByPatient: true }).allowed,
    ).toBe(false);
  });

  it("never sends anything that the patient did not initiate (e.g. AI-triggered)", () => {
    expect(
      decideContactNotification({ contact, consents: [active], kind: "ORDINARY_UPDATE", category: "CHECK_IN_REQUEST", initiatedByPatient: false }).allowed,
    ).toBe(false);
  });

  it("blocks removed contacts", () => {
    expect(
      decideContactNotification({ contact: { ...contact, revokedAt: new Date() }, consents: [active], kind: "ORDINARY_UPDATE", category: "CHECK_IN_REQUEST", initiatedByPatient: true }).allowed,
    ).toBe(false);
  });

  it("finds only active, matching consents", () => {
    expect(findCoveringConsent([active], "TRUSTED_CONTACT_SHARING", "TRUSTED_CONTACT", "c1", "CHECK_IN_REQUEST")).toBe(active);
    expect(findCoveringConsent([active], "TRUSTED_CONTACT_SHARING", "TRUSTED_CONTACT", "c2", "CHECK_IN_REQUEST")).toBeNull();
  });

  it("contact messages never include scores or conversation content", () => {
    const m = buildContactMessage("GENERAL_UPDATE", "Layla", "Mariam");
    expect(m).not.toMatch(/WHO-5|score|depress|suicid/i);
  });
});

describe("Encryption at rest", () => {
  it("round-trips and uses a random IV", () => {
    const a = encrypt("private message");
    const b = encrypt("private message");
    expect(a).not.toEqual(b);
    expect(a).not.toContain("private message");
    expect(decrypt(a)).toBe("private message");
    expect(decryptJson<{ x: number }>(encryptJson({ x: 1 }))).toEqual({ x: 1 });
  });

  it("detects tampering", () => {
    const c = encrypt("hello");
    const parts = c.split(":");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decrypt(parts.join(":"))).toThrow();
  });

  it("hashes deterministically", () => {
    expect(sha256("x")).toHaveLength(64);
    expect(sha256("x")).toBe(sha256("x"));
  });
});

describe("API validation schemas", () => {
  it("rejects weak passwords and missing terms acceptance", () => {
    expect(RegisterSchema.safeParse({ email: "a@b.co", password: "short", preferredName: "A", acceptTerms: true }).success).toBe(false);
    expect(RegisterSchema.safeParse({ email: "a@b.co", password: "longenough123", preferredName: "A", acceptTerms: false }).success).toBe(false);
    expect(RegisterSchema.safeParse({ email: "not-an-email", password: "longenough123", preferredName: "A", acceptTerms: true }).success).toBe(false);
  });

  it("ignores any client-supplied role on registration", () => {
    const r = RegisterSchema.parse({ email: "a@b.co", password: "longenough123", preferredName: "A", acceptTerms: true, role: "CLINICIAN" } as never);
    expect(r).not.toHaveProperty("role");
  });

  it("requires exactly five WHO-5 answers in range", () => {
    expect(Who5Schema.safeParse({ answers: [1, 2, 3, 4] }).success).toBe(false);
    expect(Who5Schema.safeParse({ answers: [1, 2, 3, 4, 9] }).success).toBe(false);
    expect(Who5Schema.safeParse({ answers: [1, 2, null, 4, 5] }).success).toBe(true); // service reports missing item
  });

  it("validates trusted contacts, messages and referral transitions", () => {
    expect(TrustedContactSchema.safeParse({ name: "", relationship: "Friend", canReceiveUpdates: true, canReceiveSafetyAlerts: false, sharedCategories: [], isSafetyPlanContact: false }).success).toBe(false);
    expect(TrustedContactSchema.safeParse({ name: "M", relationship: "Boss", canReceiveUpdates: true, canReceiveSafetyAlerts: false, sharedCategories: [], isSafetyPlanContact: false }).success).toBe(false);
    expect(SendMessageSchema.safeParse({ content: "   " }).success).toBe(false);
    expect(SendMessageSchema.safeParse({ content: "x".repeat(4001) }).success).toBe(false);
    expect(ReferralTransitionSchema.safeParse({ to: "REQUESTED" }).success).toBe(false);
  });
});

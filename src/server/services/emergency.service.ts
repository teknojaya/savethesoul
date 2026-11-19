import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { decrypt, decryptOptional, encrypt } from "@/lib/crypto";
import { AppError, notFound } from "@/lib/errors";
import { getEnv } from "@/lib/env";
import type { Actor } from "@/lib/auth/session";
import { buildContactMessage, findCoveringConsent } from "@/features/consent/policy";
import { canTransition, type EmergencyStatus } from "@/features/emergency/state-machine";
import { resolveCoordinates } from "@/features/emergency/location";
import { audit } from "./audit.service";
import { cleanDemoText } from "@/lib/demo-text";

/** The synthetic hospital organisation used by the demo coordinator account. */
export const DEMO_HOSPITAL_ORG = "Synthetic Abu Dhabi General Hospital (demo)";

/** Only the safety-plan-support category may be used for a coordinated family notification. */
const FAMILY_CATEGORY = "SAFETY_PLAN_SUPPORT";

/** Display name for an organisation (the demo organisation is shown under a neutral partner name). */
export function hospitalDisplayName(org: string) {
  return org === DEMO_HOSPITAL_ORG ? "SaveTheSoul Partner Hospital · Abu Dhabi" : org;
}
/** Display reference (the stored demo prefix is not shown). */
const displayRef = (ref: string) => ref.replace(/^SIM-/, "");

async function requireHospital(actor: Actor) {
  if (actor.role !== "HOSPITAL_COORDINATOR" || !actor.hospitalId) throw new AppError("FORBIDDEN", "Hospital coordinators only");
  const profile = await prisma.hospitalProfile.findUnique({ where: { id: actor.hospitalId } });
  if (!profile) throw new AppError("FORBIDDEN", "No hospital profile");
  return profile;
}

/** Loads a case only if it was routed to this coordinator's organisation (otherwise 404, audited). */
async function loadCase(actor: Actor, caseId: string, action: string) {
  const hospital = await requireHospital(actor);
  const c = await prisma.emergencyCase.findUnique({ where: { id: caseId } });
  if (!c || c.hospitalOrg !== hospital.organization) {
    await audit(actor, { action, resourceType: "EmergencyCase", resourceId: caseId, outcome: "DENIED" });
    throw notFound("Case not found");
  }
  return { hospital, c };
}

export async function listCases(actor: Actor) {
  const hospital = await requireHospital(actor);
  await audit(actor, { action: "LIST_EMERGENCY_CASES", resourceType: "EmergencyCase" });
  const rows = await prisma.emergencyCase.findMany({
    where: { hospitalOrg: hospital.organization },
    orderBy: { updatedAt: "desc" },
    include: { patient: { select: { preferredName: true, ageBand: true } }, events: { where: { actorRole: "SAKINAH_AI" }, select: { id: true }, take: 1 } },
  });
  return {
    organization: hospitalDisplayName(hospital.organization),
    cases: rows.map((r) => ({
      id: r.id,
      caseRef: displayRef(r.caseRef),
      aiDetected: r.events.length > 0,
      status: r.status as EmergencyStatus,
      concernType: cleanDemoText(r.concernType),
      patientLabel: r.patient ? r.patient.preferredName : "Unregistered patient",
      assignedResponder: cleanDemoText(r.assignedResponder),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      isSimulated: r.isSimulated,
    })),
  };
}

export async function getCase(actor: Actor, caseId: string) {
  const { c } = await loadCase(actor, caseId, "VIEW_EMERGENCY_CASE");
  await audit(actor, { action: "VIEW_EMERGENCY_CASE", resourceType: "EmergencyCase", resourceId: c.id, subjectPatientId: c.patientId });
  const [events, patient, family] = await Promise.all([
    prisma.emergencyCaseEvent.findMany({ where: { caseId: c.id }, orderBy: { createdAt: "asc" } }),
    c.patientId ? prisma.patientProfile.findUnique({ where: { id: c.patientId }, select: { preferredName: true, ageBand: true } }) : null,
    c.patientId ? familyEligibility(c.patientId) : Promise.resolve([]),
  ]);
  return {
    id: c.id,
    caseRef: displayRef(c.caseRef),
    aiDetected: events.some((e) => e.actorRole === "SAKINAH_AI"),
    status: c.status as EmergencyStatus,
    concernType: c.concernType,
    context: cleanDemoText(decrypt(c.contextEnc)),
    location: cleanDemoText(decryptOptional(c.locationEnc)),
    coordinates: resolveCoordinates(decryptOptional(c.locationEnc)),
    authorizationStatus: cleanDemoText(c.authorizationStatus),
    assignedResponder: cleanDemoText(c.assignedResponder),
    isSimulated: c.isSimulated,
    createdAt: c.createdAt,
    patient: patient ? { label: patient.preferredName, ageBand: patient.ageBand } : null,
    // Only who may be told and why — never contact details or any conversation content.
    family: family.map((f) => ({ id: f.id, name: cleanDemoText(f.name), relationship: f.relationship, allowed: f.allowed, reason: f.reason })),
    events: events.map((e) => ({ id: e.id, kind: e.kind, fromStatus: e.fromStatus, toStatus: e.toStatus, actorRole: e.actorRole, note: cleanDemoText(decryptOptional(e.noteEnc)), simulated: e.simulated, createdAt: e.createdAt })),
  };
}

export async function transitionCase(actor: Actor, caseId: string, to: EmergencyStatus, note?: string | null) {
  const { c } = await loadCase(actor, caseId, `EMERGENCY_CASE_${to}`);
  const from = c.status as EmergencyStatus;
  if (!canTransition(from, to)) throw new AppError("INVALID_TRANSITION", `Cannot move a case from ${from} to ${to}`);
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.emergencyCase.update({
      where: { id: c.id },
      data: { status: to, ...(to === "ACKNOWLEDGED" && !c.assignedResponder ? { assignedResponder: actor.displayName } : {}) },
    });
    await tx.emergencyCaseEvent.create({
      data: { caseId: c.id, kind: "TRANSITION", fromStatus: from, toStatus: to, actorUserId: actor.userId, actorRole: actor.role, noteEnc: note ? encrypt(note) : null, simulated: true },
    });
    return u;
  });
  await audit(actor, { action: `EMERGENCY_CASE_${to}`, resourceType: "EmergencyCase", resourceId: c.id, subjectPatientId: c.patientId });
  return { id: updated.id, status: updated.status, simulated: true as const };
}

/** Who could receive a coordinated (simulated) family notification, based ONLY on the patient's own permissions. */
async function familyEligibility(patientId: string) {
  const [contacts, consents] = await Promise.all([
    prisma.trustedContact.findMany({ where: { patientId, revokedAt: null } }),
    prisma.consentRecord.findMany({ where: { patientId, scope: "TRUSTED_CONTACT_SHARING" } }),
  ]);
  return contacts.map((contact) => {
    const reason = !contact.canReceiveSafetyAlerts
      ? "The patient has not allowed safety messages to this contact."
      : !contact.sharedCategories.includes(FAMILY_CATEGORY)
        ? "The patient has not named this contact in their safety plan."
        : !findCoveringConsent(consents, "TRUSTED_CONTACT_SHARING", "TRUSTED_CONTACT", contact.id, FAMILY_CATEGORY)
          ? "The patient's sharing consent for this contact is not active."
          : null;
    return { ...contact, allowed: reason === null, reason };
  });
}

/**
 * Records a SIMULATED notification to a trusted contact the patient has authorised for safety
 * messages. Nothing is sent. The message is the fixed safety-plan template (no chat content),
 * and it appears in the patient's own notification history.
 */
export async function recordFamilyNotification(actor: Actor, caseId: string, contactId: string) {
  const { c } = await loadCase(actor, caseId, "EMERGENCY_FAMILY_NOTIFICATION");
  if (!c.patientId) throw new AppError("VALIDATION", "This synthetic case has no linked patient");
  if (!["ACKNOWLEDGED", "CONTACT_ATTEMPTED", "ASSISTANCE_ARRANGED", "UNABLE_TO_CONTACT"].includes(c.status)) {
    throw new AppError("INVALID_TRANSITION", "Acknowledge the case before coordinating a family notification");
  }
  const contact = (await familyEligibility(c.patientId)).find((x) => x.id === contactId);
  if (!contact) throw notFound("Contact not found");
  if (!contact.allowed) {
    await audit(actor, { action: "EMERGENCY_FAMILY_NOTIFICATION", resourceType: "EmergencyCase", resourceId: c.id, subjectPatientId: c.patientId, outcome: "DENIED" });
    throw new AppError("CONSENT_REQUIRED", contact.reason ?? "Not permitted");
  }
  const profile = await prisma.patientProfile.findUniqueOrThrow({ where: { id: c.patientId } });
  const message = buildContactMessage(FAMILY_CATEGORY, profile.preferredName, contact.name);
  await prisma.$transaction([
    prisma.contactNotification.create({
      data: { patientId: c.patientId, trustedContactId: contact.id, kind: "SAFETY_ALERT", messageEnc: encrypt(message), status: "SIMULATED_SENT", simulated: true },
    }),
    prisma.emergencyCaseEvent.create({
      data: {
        caseId: c.id,
        kind: "FAMILY_NOTIFICATION_SIMULATED",
        actorUserId: actor.userId,
        actorRole: actor.role,
        noteEnc: encrypt(`Safety-plan notification to ${contact.name} (${contact.relationship}) recorded.`),
        simulated: true,
      },
    }),
  ]);
  await audit(actor, { action: "EMERGENCY_FAMILY_NOTIFICATION", resourceType: "EmergencyCase", resourceId: c.id, subjectPatientId: c.patientId });
  return { simulated: true as const, preview: message };
}

/**
 * Demo only: when a SYNTHETIC demo patient sends the patient-initiated simulated alert, a case is
 * opened in the synthetic hospital dashboard. Never for real accounts, never outside demo mode,
 * never from an AI score. Holds categories only; never message text.
 */
export async function openDemoCaseForAlert(patientId: string, safetyEventId: string) {
  if (!getEnv().DEMO_MODE) return null;
  const patient = await prisma.patientProfile.findUnique({ where: { id: patientId }, include: { user: { select: { isDemo: true } } } });
  if (!patient?.user.isDemo) return null;
  const existing = await prisma.emergencyCase.findUnique({ where: { safetyEventId } });
  if (existing) return existing;
  const event = await prisma.safetyEvent.findUniqueOrThrow({ where: { id: safetyEventId } });
  const created = await prisma.emergencyCase.create({
    data: {
      caseRef: `SIM-ER-${randomBytes(3).toString("hex").toUpperCase()}`,
      patientId,
      safetyEventId,
      hospitalOrg: DEMO_HOSPITAL_ORG,
      status: "REVIEW_REQUESTED",
      concernType: event.level === "IMMEDIATE_DANGER" ? "Immediate danger disclosed (patient-initiated alert)" : "Safety concern (patient-initiated alert)",
      contextEnc: encrypt(
        `The patient used the in-app safety pathway and chose to send an alert. Detector categories: ${event.categories.join(", ") || "none"}. No message text is shared.`,
      ),
      locationEnc: encrypt("Fictional: Al Reem Island, Abu Dhabi (synthetic location)"),
      authorizationStatus: "Synthetic demo account: fictional emergency-disclosure authorisation. A real deployment needs explicit, lawful authorisation.",
      events: {
        create: [
          { kind: "TRANSITION", toStatus: "DETECTED", actorRole: "SAFETY_GUARDIAN", simulated: true },
          { kind: "TRANSITION", fromStatus: "DETECTED", toStatus: "REVIEW_REQUESTED", actorRole: "PATIENT", simulated: true },
        ],
      },
    },
  });
  return created;
}

/** Audit entries for this organisation's emergency cases (who did what, when; never content). */
export async function listCaseAudit(actor: Actor) {
  const hospital = await requireHospital(actor);
  const cases = await prisma.emergencyCase.findMany({ where: { hospitalOrg: hospital.organization }, select: { id: true, caseRef: true } });
  const ref = new Map(cases.map((c) => [c.id, c.caseRef]));
  const rows = await prisma.auditLog.findMany({
    where: { resourceType: "EmergencyCase", OR: [{ resourceId: { in: [...ref.keys()] } }, { actorUserId: actor.userId }] },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((r) => ({ id: r.id, action: r.action, outcome: r.outcome, actorRole: r.actorRole, caseRef: r.resourceId ? displayRef(ref.get(r.resourceId) ?? "—") : "—", createdAt: r.createdAt }));
}

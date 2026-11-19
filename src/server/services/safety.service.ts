import { openDemoCaseForAlert } from "./emergency.service";
import { prisma } from "@/lib/db/prisma";
import { decryptJson, encryptJson } from "@/lib/crypto";
import type { Actor } from "@/lib/auth/session";
import { AppError, notFound } from "@/lib/errors";
import { getEnv } from "@/lib/env";
import type { z } from "zod";
import type { SafetyPlanSchema } from "@/lib/validation/schemas";
import { audit, recordSystemEvent } from "./audit.service";
import { requireAssignment } from "./access.service";

export type SafetyPlanContent = z.infer<typeof SafetyPlanSchema>;

/** Aggregate-only crisis workflow telemetry (no patient id, no content). */
export async function recordCrisisWorkflowStep(code: string) {
  await recordSystemEvent("CRISIS_WORKFLOW", code);
}

/** Patient self-reports danger via the safety check-in card or help page. */
export async function createSelfReportedEvent(patientId: string, level: "IMMEDIATE_DANGER" | "ELEVATED_CONCERN", conversationId?: string) {
  if (conversationId) {
    const owned = await prisma.conversation.findFirst({ where: { id: conversationId, patientId } });
    if (!owned) throw notFound("Conversation not found");
  }
  return prisma.safetyEvent.create({
    data: {
      patientId,
      conversationId: conversationId ?? null,
      level,
      source: "HELP_BUTTON",
      detector: "self-report",
      categories: ["SELF_REPORTED"],
    },
  });
}

/**
 * Patient-initiated SIMULATED alert to their assigned care team.
 * The prototype never contacts real clinicians, hospitals, police or family.
 * If no care team is connected, the hand-off is recorded as FAILED and the patient is
 * directed to the real emergency numbers (which are always displayed).
 */
export async function sendSimulatedCareTeamAlert(patientId: string, safetyEventId: string) {
  const event = await prisma.safetyEvent.findFirst({ where: { id: safetyEventId, patientId } });
  if (!event) throw notFound("Safety event not found");
  if (event.simulatedAlertAt) return { status: event.workflowStatus, simulated: true as const, alreadySent: true };

  const team = await prisma.careAssignment.findMany({
    where: { patientId, status: "ACTIVE" },
    include: { clinician: { include: { user: { select: { displayName: true } } } } },
  });

  // Demo only: also open a SIMULATED case in the synthetic hospital dashboard (demo accounts only).
  const hospitalCase = await openDemoCaseForAlert(patientId, event.id);
  const hospital = hospitalCase ? { hospitalCaseRef: hospitalCase.caseRef } : {};

  if (!team.length) {
    await prisma.safetyEvent.update({
      where: { id: event.id },
      data: { workflowStatus: "HANDOFF_FAILED", failureReason: "NO_CARE_TEAM_CONNECTED" },
    });
    await recordSystemEvent("HANDOFF_FAILED", "NO_CARE_TEAM_CONNECTED");
    return { status: "HANDOFF_FAILED" as const, simulated: true as const, reason: "No care team is connected to your account yet.", ...hospital };
  }

  await prisma.safetyEvent.update({
    where: { id: event.id },
    data: { workflowStatus: "SIMULATED_ALERT_SENT", simulatedAlertAt: new Date() },
  });
  await recordCrisisWorkflowStep("SIMULATED_ALERT_SENT");
  return {
    status: "SIMULATED_ALERT_SENT" as const,
    simulated: true as const,
    recipients: team.map((t) => t.clinician.user.displayName),
    ...hospital,
  };
}

export async function getEventStatus(patientId: string, safetyEventId: string) {
  const e = await prisma.safetyEvent.findFirst({
    where: { id: safetyEventId, patientId },
    select: { id: true, workflowStatus: true, simulatedAlertAt: true, acknowledgedAt: true, failureReason: true },
  });
  if (!e) throw notFound("Safety event not found");
  return e;
}

/** Clinician acknowledges a simulated alert (demo scenario 3). */
export async function acknowledgeAlert(actor: Actor, safetyEventId: string) {
  const event = await prisma.safetyEvent.findUnique({ where: { id: safetyEventId } });
  if (!event) throw notFound("Safety event not found");
  await requireAssignment(actor, event.patientId, "SAFETY_ALERT_ACKNOWLEDGE");
  if (event.workflowStatus !== "SIMULATED_ALERT_SENT") {
    throw new AppError("INVALID_TRANSITION", "Only a sent alert can be acknowledged");
  }
  const updated = await prisma.safetyEvent.update({
    where: { id: safetyEventId },
    data: { workflowStatus: "SIMULATED_ACKNOWLEDGED", acknowledgedAt: new Date(), acknowledgedById: actor.userId },
  });
  await audit(actor, { action: "SAFETY_ALERT_ACKNOWLEDGE", resourceType: "SafetyEvent", resourceId: safetyEventId, subjectPatientId: event.patientId });
  await recordCrisisWorkflowStep("SIMULATED_ACKNOWLEDGED");
  return updated;
}

/** Demo-only: simulate a clinician acknowledgement so a single judge can see the full loop. */
export async function simulateAcknowledgement(patientId: string, safetyEventId: string) {
  if (!getEnv().DEMO_MODE) throw new AppError("FORBIDDEN", "Simulation is only available in demo mode");
  const event = await prisma.safetyEvent.findFirst({ where: { id: safetyEventId, patientId } });
  if (!event) throw notFound("Safety event not found");
  if (event.workflowStatus !== "SIMULATED_ALERT_SENT") {
    throw new AppError("INVALID_TRANSITION", "Only a sent alert can be acknowledged");
  }
  await recordCrisisWorkflowStep("SIMULATED_ACKNOWLEDGED");
  return prisma.safetyEvent.update({
    where: { id: safetyEventId },
    data: { workflowStatus: "SIMULATED_ACKNOWLEDGED", acknowledgedAt: new Date(), acknowledgedById: null },
  });
}

export async function listAlertsForClinician(actor: Actor) {
  if (!actor.clinicianId) return [];
  const assignments = await prisma.careAssignment.findMany({
    where: { clinicianId: actor.clinicianId, status: "ACTIVE" },
    select: { patientId: true },
  });
  return prisma.safetyEvent.findMany({
    where: { patientId: { in: assignments.map((a) => a.patientId) }, simulatedAlertAt: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      level: true,
      source: true,
      categories: true,
      workflowStatus: true,
      simulatedAlertAt: true,
      acknowledgedAt: true,
      createdAt: true,
      patient: { select: { id: true, preferredName: true } },
    },
  });
}

// ───────────── Safety plan ─────────────

const EMPTY_PLAN: SafetyPlanContent = {
  warningSigns: "",
  copingStrategies: "",
  peopleAndPlaces: "",
  reasonsForLiving: "",
  professionalContacts: "800-SAKINA (800 725462) — 24/7\nAmbulance 998 · Police 999",
  makingSafe: "",
};

export async function getSafetyPlan(patientId: string): Promise<SafetyPlanContent & { updatedAt: Date | null }> {
  const plan = await prisma.safetyPlan.findUnique({ where: { patientId } });
  if (!plan) return { ...EMPTY_PLAN, updatedAt: null };
  return { ...decryptJson<SafetyPlanContent>(plan.contentEnc), updatedAt: plan.updatedAt };
}

export async function saveSafetyPlan(patientId: string, content: SafetyPlanContent) {
  const contentEnc = encryptJson(content);
  return prisma.safetyPlan.upsert({
    where: { patientId },
    create: { patientId, contentEnc },
    update: { contentEnc },
    select: { updatedAt: true },
  });
}

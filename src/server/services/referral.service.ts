import { prisma } from "@/lib/db/prisma";
import { decryptOptional, encryptOptional } from "@/lib/crypto";
import type { Actor } from "@/lib/auth/session";
import { AppError, notFound } from "@/lib/errors";
import { getEnv } from "@/lib/env";
import { assertTransition, type ReferralActor, type ReferralStatus } from "@/features/referrals/state-machine";
import { audit } from "./audit.service";
import { cleanDemoText } from "@/lib/demo-text";

export async function createReferral(
  patientId: string,
  input: {
    clinicianId?: string | null;
    resourceId?: string | null;
    urgency: "ROUTINE" | "SOON" | "URGENT";
    reason?: string | null;
    careType?: "PSYCHOLOGIST" | "PSYCHIATRIST" | "PRIMARY_CARE" | "SERVICE" | null;
  },
) {
  if (!input.clinicianId && !input.resourceId) {
    throw new AppError("VALIDATION", "Choose a clinician or a service");
  }
  if (input.clinicianId) {
    const c = await prisma.clinicianProfile.findUnique({ where: { id: input.clinicianId } });
    if (!c) throw notFound("Clinician not found");
  }
  if (input.resourceId) {
    const r = await prisma.supportResource.findUnique({ where: { id: input.resourceId } });
    if (!r) throw notFound("Service not found");
  }
  return prisma.$transaction(async (tx) => {
    if (input.clinicianId) {
      await tx.careAssignment.upsert({
        where: { patientId_clinicianId: { patientId, clinicianId: input.clinicianId } },
        create: { patientId, clinicianId: input.clinicianId },
        update: { status: "ACTIVE" },
      });
    }
    const referral = await tx.careReferral.create({
      data: {
        patientId,
        clinicianId: input.clinicianId ?? null,
        resourceId: input.resourceId ?? null,
        urgency: input.urgency,
        careType: input.careType ?? null,
        reasonEnc: encryptOptional(input.reason),
        isSimulated: true,
      },
    });
    await tx.referralEvent.create({
      data: { referralId: referral.id, toStatus: "REQUESTED", actorRole: "PATIENT", simulated: true },
    });
    return referral;
  });
}

const referralInclude = {
  events: { orderBy: { createdAt: "asc" as const } },
  clinician: { include: { user: { select: { displayName: true } } } },
  resource: { select: { name: true, phone: true } },
  patient: { select: { id: true, preferredName: true } },
  followUps: { orderBy: { scheduledFor: "asc" as const } },
};

function present(r: Awaited<ReturnType<typeof loadReferral>>) {
  if (!r) return null;
  return {
    id: r.id,
    status: r.status as ReferralStatus,
    urgency: r.urgency,
    isSimulated: r.isSimulated,
    reason: cleanDemoText(decryptOptional(r.reasonEnc)),
    requestedAt: r.requestedAt,
    firstContactAt: r.firstContactAt,
    completedAt: r.completedAt,
    clinicianName: r.clinician?.user.displayName ?? null,
    clinicianOrg: r.clinician?.organization ?? null,
    resourceName: r.resource?.name ?? null,
    patient: r.patient,
    events: r.events,
    followUps: r.followUps,
  };
}

function loadReferral(id: string) {
  return prisma.careReferral.findUnique({ where: { id }, include: referralInclude });
}

export async function listPatientReferrals(patientId: string) {
  const rows = await prisma.careReferral.findMany({ where: { patientId }, include: referralInclude, orderBy: { requestedAt: "desc" } });
  return rows.map((r) => present(r)!);
}

export async function listClinicianReferrals(actor: Actor) {
  if (!actor.clinicianId) return [];
  const rows = await prisma.careReferral.findMany({
    where: { clinicianId: actor.clinicianId },
    include: referralInclude,
    orderBy: { requestedAt: "desc" },
  });
  await audit(actor, { action: "LIST_REFERRALS", resourceType: "CareReferral" });
  // Clinicians see referral workflow metadata; the patient's free-text reason is
  // only visible while a sharing consent is active (checked per referral).
  const consents = await prisma.consentRecord.findMany({
    where: { scope: "SHARE_SUMMARY_WITH_CLINICIAN", granteeId: actor.clinicianId, revokedAt: null },
    select: { patientId: true },
  });
  const consented = new Set(consents.map((c) => c.patientId));
  return rows.map((r) => {
    const p = present(r)!;
    return { ...p, reason: consented.has(p.patient.id) ? p.reason : null, hasSharingConsent: consented.has(p.patient.id) };
  });
}

export async function transitionReferral(
  actor: Actor,
  referralId: string,
  to: ReferralStatus,
  opts: { note?: string | null; scheduledFor?: Date },
) {
  const referral = await prisma.careReferral.findUnique({ where: { id: referralId } });
  if (!referral) throw notFound("Referral not found");

  let referralActor: ReferralActor;
  if (actor.role === "PATIENT") {
    if (referral.patientId !== actor.patientId) throw notFound("Referral not found");
    referralActor = "PATIENT";
  } else if (actor.role === "CLINICIAN") {
    if (!actor.clinicianId || referral.clinicianId !== actor.clinicianId) {
      await audit(actor, { action: "REFERRAL_TRANSITION", resourceType: "CareReferral", resourceId: referralId, subjectPatientId: referral.patientId, outcome: "DENIED" });
      throw new AppError("FORBIDDEN", "This referral is not assigned to you");
    }
    referralActor = "CLINICIAN";
  } else {
    throw new AppError("FORBIDDEN", "Not allowed");
  }

  return applyTransition(referral.id, referral.status as ReferralStatus, to, referralActor, actor, opts);
}

/** Demo only — clearly labelled simulated acknowledgement for referrals without a live clinician. */
export async function simulateReferralAcknowledgement(patientId: string, referralId: string) {
  if (!getEnv().DEMO_MODE) throw new AppError("FORBIDDEN", "Simulation is only available in demo mode");
  const referral = await prisma.careReferral.findFirst({ where: { id: referralId, patientId } });
  if (!referral) throw notFound("Referral not found");
  return applyTransition(referral.id, referral.status as ReferralStatus, "ACKNOWLEDGED", "SIMULATION", null, {
    note: "SIMULATED acknowledgement for demonstration. No real provider has received or accepted this referral.",
  });
}

async function applyTransition(
  referralId: string,
  from: ReferralStatus,
  to: ReferralStatus,
  referralActor: ReferralActor,
  actor: Actor | null,
  opts: { note?: string | null; scheduledFor?: Date },
) {
  const check = assertTransition(from, to, referralActor);
  if (!check.ok) throw new AppError("INVALID_TRANSITION", check.reason);
  if (to === "SCHEDULED" && !opts.scheduledFor) {
    throw new AppError("VALIDATION", "A scheduled date is required");
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    // Optimistic concurrency: only update if status is still `from`.
    const res = await tx.careReferral.updateMany({
      where: { id: referralId, status: from },
      data: {
        status: to,
        completedAt: to === "COMPLETED" ? now : undefined,
      },
    });
    if (res.count === 0) throw new AppError("CONFLICT", "This referral was updated by someone else. Please refresh.");
    const r = await tx.careReferral.findUniqueOrThrow({ where: { id: referralId } });
    if (to === "ACKNOWLEDGED" && !r.firstContactAt) {
      await tx.careReferral.update({ where: { id: referralId }, data: { firstContactAt: now } });
    }
    await tx.referralEvent.create({
      data: {
        referralId,
        fromStatus: from,
        toStatus: to,
        actorUserId: actor?.userId ?? null,
        actorRole: referralActor,
        note: opts.note ?? null,
        simulated: true,
      },
    });
    if (to === "SCHEDULED" && opts.scheduledFor && r.clinicianId) {
      await tx.followUp.create({
        data: { patientId: r.patientId, clinicianId: r.clinicianId, referralId, scheduledFor: opts.scheduledFor },
      });
    }
    return r;
  });
  if (actor) {
    await audit(actor, { action: `REFERRAL_${to}`, resourceType: "CareReferral", resourceId: referralId, subjectPatientId: updated.patientId });
  }
  return present(await loadReferral(referralId))!;
}

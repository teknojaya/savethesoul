import { prisma } from "@/lib/db/prisma";
import { decrypt, decryptOptional, encrypt } from "@/lib/crypto";
import type { Actor } from "@/lib/auth/session";
import { AppError, notFound } from "@/lib/errors";
import { computeWho5Trend, summariseCheckIns } from "@/features/assessments/trends";
import { audit } from "./audit.service";
import { getClinicianGrant, requireAssignment, requireClinician, requireClinicianAccess } from "./access.service";
import { listSummariesForClinician } from "./summary.service";
import { cleanDemoText } from "@/lib/demo-text";

export function getClinicianProfile(clinicianId: string) {
  return prisma.clinicianProfile.findUniqueOrThrow({
    where: { id: clinicianId },
    select: { title: true, specialty: true, organization: true, isSynthetic: true },
  });
}

/** Assigned patients, with whether each has an active sharing consent for this clinician. */
export async function listAssignedPatients(actor: Actor) {
  const clinicianId = requireClinician(actor);
  const assignments = await prisma.careAssignment.findMany({
    where: { clinicianId, status: "ACTIVE" },
    include: { patient: { select: { id: true, preferredName: true, ageBand: true, region: true } } },
    orderBy: { createdAt: "desc" },
  });
  await audit(actor, { action: "LIST_ASSIGNED_PATIENTS", resourceType: "Patient" });
  return Promise.all(
    assignments.map(async (a) => {
      const grant = await getClinicianGrant(clinicianId, a.patientId);
      let latestWho5: number | null = null;
      let trendDirection: string | null = null;
      if (grant?.categories.includes("WHO5_HISTORY")) {
        const who5 = await prisma.wellbeingAssessment.findMany({ where: { patientId: a.patientId }, orderBy: { completedAt: "asc" } });
        const t = computeWho5Trend(who5);
        latestWho5 = t.latest?.percentScore ?? null;
        trendDirection = t.direction;
      }
      const [openReferrals, pendingAlerts] = await Promise.all([
        prisma.careReferral.count({ where: { patientId: a.patientId, clinicianId, status: { in: ["REQUESTED", "ACKNOWLEDGED", "SCHEDULED", "UNABLE_TO_CONTACT"] } } }),
        prisma.safetyEvent.count({ where: { patientId: a.patientId, workflowStatus: "SIMULATED_ALERT_SENT" } }),
      ]);
      return {
        patientId: a.patientId,
        preferredName: a.patient.preferredName,
        ageBand: grant ? a.patient.ageBand : null,
        region: a.patient.region,
        hasConsent: !!grant,
        sharedCategories: grant?.categories ?? [],
        latestWho5,
        trendDirection,
        openReferrals,
        pendingAlerts,
        assignedAt: a.createdAt,
      };
    }),
  );
}

/**
 * Full patient detail for the clinician — everything here is gated by the live consent
 * categories. Complete private conversations are never exposed.
 */
export async function getPatientDetail(actor: Actor, patientId: string) {
  const grant = await requireClinicianAccess(actor, patientId, "VIEW_PATIENT_DETAIL");
  const has = (c: string) => grant.categories.includes(c);
  const profile = await prisma.patientProfile.findUniqueOrThrow({ where: { id: patientId }, include: { user: { select: { isDemo: true } } } });

  const [assessments, checkInsRaw, summaries, notes, referrals, followUps, alerts] = await Promise.all([
    has("WHO5_HISTORY")
      ? prisma.wellbeingAssessment.findMany({ where: { patientId }, orderBy: { completedAt: "asc" }, select: { id: true, percentScore: true, rawScore: true, completedAt: true } })
      : Promise.resolve(null),
    has("MOOD_TRENDS") || has("SLEEP_STRESS") || has("FUNCTIONING")
      ? prisma.wellbeingCheckIn.findMany({ where: { patientId, createdAt: { gte: new Date(Date.now() - 60 * 86_400_000) } }, orderBy: { createdAt: "asc" } })
      : Promise.resolve(null),
    listSummariesForClinician(actor, patientId),
    prisma.clinicianNote.findMany({ where: { patientId, clinicianId: grant.clinicianId }, orderBy: { createdAt: "desc" } }),
    prisma.careReferral.findMany({ where: { patientId, clinicianId: grant.clinicianId }, orderBy: { requestedAt: "desc" }, include: { events: { orderBy: { createdAt: "asc" } } } }),
    prisma.followUp.findMany({ where: { patientId, clinicianId: grant.clinicianId }, orderBy: { scheduledFor: "asc" } }),
    prisma.safetyEvent.findMany({ where: { patientId, simulatedAlertAt: { not: null } }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, level: true, workflowStatus: true, simulatedAlertAt: true, acknowledgedAt: true, createdAt: true, categories: true } }),
  ]);

  // Only the shared check-in fields leave the server.
  const checkIns = checkInsRaw?.map((c) => ({
    createdAt: c.createdAt,
    mood: has("MOOD_TRENDS") ? c.mood : null,
    stress: has("SLEEP_STRESS") ? c.stress : null,
    sleepQuality: has("SLEEP_STRESS") ? c.sleepQuality : null,
    functioning: has("FUNCTIONING") ? c.functioning : null,
  }));

  return {
    patient: {
      id: profile.id,
      preferredName: profile.preferredName,
      ageBand: profile.ageBand,
      region: profile.region,
      physicalHealthContext: has("PHYSICAL_HEALTH_CONTEXT") ? decryptOptional(profile.physicalHealthEnc) : null,
      isSynthetic: profile.user.isDemo,
    },
    sharedCategories: grant.categories,
    assessments,
    who5Trend: assessments ? computeWho5Trend(assessments) : null,
    checkIns: checkIns ?? null,
    checkInSummary: checkIns
      ? summariseCheckIns(checkIns.map((c) => ({ mood: c.mood ?? 0, stress: c.stress, sleepQuality: c.sleepQuality, functioning: c.functioning, createdAt: c.createdAt })))
      : null,
    summaries,
    notes: notes.map((n) => ({ id: n.id, content: cleanDemoText(decrypt(n.contentEnc)), createdAt: n.createdAt })),
    referrals: referrals.map((r) => ({ ...r, reason: cleanDemoText(decryptOptional(r.reasonEnc)), reasonEnc: undefined })),
    followUps,
    alerts,
    conversations: has("CONVERSATIONS") ? await sharedConversations(actor, patientId) : null,
  };
}

/**
 * Full chat history, ONLY when the patient explicitly shared "Your Sakinah conversations" with
 * this clinician (active, revocable consent checked by the caller). Read-only, audited separately,
 * and never sent to any AI.
 */
async function sharedConversations(actor: Actor, patientId: string) {
  await audit(actor, { action: "VIEW_SHARED_CONVERSATIONS", resourceType: "Conversation", subjectPatientId: patientId });
  const rows = await prisma.conversation.findMany({
    where: { patientId, ephemeral: false },
    orderBy: { updatedAt: "desc" },
    take: 20,
    include: { messages: { orderBy: { createdAt: "asc" }, take: 200 } },
  });
  return rows
    .filter((c) => c.messages.length)
    .map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updatedAt,
      messages: c.messages.map((m) => ({ id: m.id, role: m.role, content: decrypt(m.contentEnc), createdAt: m.createdAt })),
    }));
}

export async function addClinicianNote(actor: Actor, patientId: string, content: string) {
  const { clinicianId } = await requireClinicianAccess(actor, patientId, "ADD_CLINICIAN_NOTE");
  return prisma.clinicianNote.create({
    data: { patientId, clinicianId, contentEnc: encrypt(content) },
    select: { id: true, createdAt: true },
  });
}

export async function listFollowUps(actor: Actor) {
  const clinicianId = requireClinician(actor);
  return prisma.followUp.findMany({
    where: { clinicianId },
    orderBy: { scheduledFor: "asc" },
    include: { patient: { select: { id: true, preferredName: true } }, referral: { select: { id: true, status: true } } },
  });
}

export async function updateFollowUp(
  actor: Actor,
  followUpId: string,
  input: { status: "PLANNED" | "COMPLETED" | "MISSED" | "CANCELLED"; functioningChange?: number | null },
) {
  const clinicianId = requireClinician(actor);
  const f = await prisma.followUp.findUnique({ where: { id: followUpId } });
  if (!f) throw notFound("Follow-up not found");
  if (f.clinicianId !== clinicianId) throw new AppError("FORBIDDEN", "This follow-up is not yours");
  await requireAssignment(actor, f.patientId, "UPDATE_FOLLOW_UP");
  const updated = await prisma.followUp.update({
    where: { id: followUpId },
    data: {
      status: input.status,
      functioningChange: input.functioningChange ?? undefined,
      completedAt: input.status === "COMPLETED" ? new Date() : null,
    },
  });
  await audit(actor, { action: `FOLLOW_UP_${input.status}`, resourceType: "FollowUp", resourceId: followUpId, subjectPatientId: f.patientId });
  return updated;
}

export async function clinicianOverview(actor: Actor) {
  const clinicianId = requireClinician(actor);
  const [patients, referralsByStatus, upcoming, pendingAlerts] = await Promise.all([
    prisma.careAssignment.count({ where: { clinicianId, status: "ACTIVE" } }),
    prisma.careReferral.groupBy({ by: ["status"], where: { clinicianId }, _count: true }),
    prisma.followUp.findMany({
      where: { clinicianId, status: "PLANNED" },
      orderBy: { scheduledFor: "asc" },
      take: 5,
      include: { patient: { select: { id: true, preferredName: true } } },
    }),
    prisma.safetyEvent.count({
      where: {
        workflowStatus: "SIMULATED_ALERT_SENT",
        patient: { assignments: { some: { clinicianId, status: "ACTIVE" } } },
      },
    }),
  ]);
  return {
    patients,
    referralsByStatus: Object.fromEntries(referralsByStatus.map((r) => [r.status, r._count])) as Record<string, number>,
    upcoming,
    pendingAlerts,
  };
}

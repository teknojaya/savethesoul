import { prisma } from "@/lib/db/prisma";
import { decryptOptional } from "@/lib/crypto";

export async function getPatientProfile(patientId: string) {
  const p = await prisma.patientProfile.findUniqueOrThrow({ where: { id: patientId } });
  return {
    id: p.id,
    preferredName: p.preferredName,
    ageBand: p.ageBand,
    region: p.region,
    onboardingCompleted: p.onboardingCompleted,
    chatHistoryEnabled: p.chatHistoryEnabled,
    memoryEnabled: p.memoryEnabled,
    physicalHealthContext: decryptOptional(p.physicalHealthEnc),
  };
}

export async function getDashboardExtras(patientId: string) {
  const [openReferrals, contacts, safetyPlan, lastCheckIn, conversations] = await Promise.all([
    prisma.careReferral.findMany({
      where: { patientId, status: { in: ["REQUESTED", "ACKNOWLEDGED", "SCHEDULED", "UNABLE_TO_CONTACT"] } },
      include: { clinician: { include: { user: { select: { displayName: true } } } }, resource: { select: { name: true } } },
      orderBy: { requestedAt: "desc" },
      take: 3,
    }),
    prisma.trustedContact.count({ where: { patientId, revokedAt: null } }),
    prisma.safetyPlan.findUnique({ where: { patientId }, select: { updatedAt: true } }),
    prisma.wellbeingCheckIn.findFirst({ where: { patientId }, orderBy: { createdAt: "desc" }, select: { createdAt: true, mood: true } }),
    prisma.conversation.findMany({ where: { patientId, ephemeral: false }, orderBy: { updatedAt: "desc" }, take: 1, select: { id: true, updatedAt: true } }),
  ]);
  return { openReferrals, contacts, safetyPlanUpdatedAt: safetyPlan?.updatedAt ?? null, lastCheckIn, lastConversation: conversations[0] ?? null };
}

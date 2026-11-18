import { prisma } from "@/lib/db/prisma";
import { decrypt, decryptJson, decryptOptional } from "@/lib/crypto";
import { audit } from "./audit.service";
import type { Actor } from "@/lib/auth/session";

/** Machine-readable export of everything stored about the patient (decrypted). */
export async function exportPatientData(actor: Actor & { patientId: string }) {
  const patientId = actor.patientId;
  const p = await prisma.patientProfile.findUniqueOrThrow({
    where: { id: patientId },
    include: {
      user: { select: { email: true, createdAt: true, locale: true } },
      conversations: { include: { messages: { orderBy: { createdAt: "asc" } } } },
      checkIns: true,
      assessments: true,
      goals: true,
      memories: true,
      consents: true,
      trustedContacts: true,
      notifications: true,
      referrals: { include: { events: true } },
      summaries: true,
      safetyEvents: true,
      safetyPlan: true,
      followUps: true,
    },
  });
  await audit(actor, { action: "EXPORT_OWN_DATA", resourceType: "Patient", resourceId: patientId, subjectPatientId: patientId });
  return {
    exportedAt: new Date().toISOString(),
    format: "SaveTheSoul patient export v1",
    account: { email: p.user.email, createdAt: p.user.createdAt, locale: p.user.locale },
    profile: {
      preferredName: p.preferredName,
      ageBand: p.ageBand,
      region: p.region,
      chatHistoryEnabled: p.chatHistoryEnabled,
      memoryEnabled: p.memoryEnabled,
      physicalHealthContext: decryptOptional(p.physicalHealthEnc),
    },
    conversations: p.conversations.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      messages: c.messages.map((m) => ({ role: m.role, content: decrypt(m.contentEnc), provider: m.provider, createdAt: m.createdAt })),
    })),
    checkIns: p.checkIns.map((c) => ({ ...c, noteEnc: undefined, note: decryptOptional(c.noteEnc) })),
    who5Assessments: p.assessments,
    goals: p.goals,
    memories: p.memories.map((m) => ({ id: m.id, content: decrypt(m.contentEnc), createdAt: m.createdAt })),
    consents: p.consents,
    trustedContacts: p.trustedContacts.map((c) => ({
      ...c,
      phoneEnc: undefined,
      emailEnc: undefined,
      phone: decryptOptional(c.phoneEnc),
      email: decryptOptional(c.emailEnc),
    })),
    notifications: p.notifications.map((n) => ({ ...n, messageEnc: undefined, message: decrypt(n.messageEnc) })),
    referrals: p.referrals.map((r) => ({ ...r, reasonEnc: undefined, reason: decryptOptional(r.reasonEnc) })),
    sharedSummaries: p.summaries.map((s) => ({
      id: s.id,
      clinicianId: s.clinicianId,
      status: s.status,
      sharedAt: s.sharedAt,
      content: decryptJson(s.contentEnc),
      aiDraft: decryptOptional(s.aiDraftEnc),
    })),
    safetyEvents: p.safetyEvents,
    safetyPlan: p.safetyPlan ? decryptJson(p.safetyPlan.contentEnc) : null,
    followUps: p.followUps,
  };
}

/**
 * Permanently deletes the patient account and all associated records (cascade).
 * Audit entries keep only the opaque subject id for accountability; they contain no content.
 */
export async function deletePatientAccount(actor: Actor & { patientId: string }) {
  await audit(actor, { action: "DELETE_OWN_ACCOUNT", resourceType: "Patient", resourceId: actor.patientId, subjectPatientId: actor.patientId });
  await prisma.user.delete({ where: { id: actor.userId } });
}

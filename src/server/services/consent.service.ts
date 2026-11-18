import { prisma } from "@/lib/db/prisma";
import { notFound } from "@/lib/errors";

export async function listConsents(patientId: string) {
  return prisma.consentRecord.findMany({ where: { patientId }, orderBy: { grantedAt: "desc" } });
}

/** Consent ledger with human-readable grantee names (clinician / trusted contact). */
export async function listConsentsWithNames(patientId: string) {
  const consents = await listConsents(patientId);
  const clinicianIds = consents.filter((c) => c.granteeType === "CLINICIAN" && c.granteeId).map((c) => c.granteeId!);
  const contactIds = consents.filter((c) => c.granteeType === "TRUSTED_CONTACT" && c.granteeId).map((c) => c.granteeId!);
  const [clinicians, contacts] = await Promise.all([
    prisma.clinicianProfile.findMany({ where: { id: { in: clinicianIds } }, include: { user: { select: { displayName: true } } } }),
    prisma.trustedContact.findMany({ where: { id: { in: contactIds }, patientId }, select: { id: true, name: true } }),
  ]);
  const names = new Map<string, string>([
    ...clinicians.map((c) => [c.id, c.user.displayName] as [string, string]),
    ...contacts.map((c) => [c.id, c.name] as [string, string]),
  ]);
  return consents.map((c) => ({ ...c, granteeName: c.granteeId ? (names.get(c.granteeId) ?? "Removed") : null }));
}

/**
 * Revokes a consent. Effects are immediate and enforced server-side:
 *  - SHARE_SUMMARY_WITH_CLINICIAN → clinician loses access; shared summaries are revoked.
 *  - TRUSTED_CONTACT_SHARING      → subsequent ordinary sharing is blocked.
 *  - WELLBEING_MEMORY             → memory turned off and stored memories deleted.
 */
export async function revokeConsent(patientId: string, consentId: string) {
  const consent = await prisma.consentRecord.findFirst({ where: { id: consentId, patientId } });
  if (!consent) throw notFound("Consent not found");
  if (consent.revokedAt) return consent;
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const updated = await tx.consentRecord.update({ where: { id: consentId }, data: { revokedAt: now } });
    if (consent.scope === "SHARE_SUMMARY_WITH_CLINICIAN" && consent.granteeId) {
      await tx.clinicalSummary.updateMany({
        where: { patientId, clinicianId: consent.granteeId, status: "SHARED" },
        data: { status: "REVOKED", revokedAt: now },
      });
    }
    if (consent.scope === "WELLBEING_MEMORY") {
      await tx.patientProfile.update({ where: { id: patientId }, data: { memoryEnabled: false } });
      await tx.wellbeingMemory.deleteMany({ where: { patientId } });
    }
    return updated;
  });
}

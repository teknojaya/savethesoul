import { prisma } from "@/lib/db/prisma";
import type { Actor } from "@/lib/auth/session";
import { AppError, forbidden } from "@/lib/errors";
import { audit } from "./audit.service";

/** Patient-scoped actor guard. Patients can only ever act on their own profile. */
export function requirePatient(actor: Actor): string {
  if (actor.role !== "PATIENT" || !actor.patientId) throw forbidden("Only patients can do this");
  return actor.patientId;
}

export function requireClinician(actor: Actor): string {
  if (actor.role !== "CLINICIAN" || !actor.clinicianId) throw forbidden("Only clinicians can do this");
  return actor.clinicianId;
}

export interface ClinicianGrant {
  consentId: string;
  categories: string[];
}

/**
 * A clinician may access a patient's information only when BOTH:
 *   1. there is an ACTIVE care assignment, and
 *   2. the patient has an ACTIVE (unrevoked) sharing consent naming this clinician.
 * Every decision — allowed or denied — is audited.
 */
export async function getClinicianGrant(clinicianId: string, patientId: string): Promise<ClinicianGrant | null> {
  const [assignment, consent] = await Promise.all([
    prisma.careAssignment.findFirst({ where: { clinicianId, patientId, status: "ACTIVE" } }),
    prisma.consentRecord.findFirst({
      where: {
        patientId,
        scope: "SHARE_SUMMARY_WITH_CLINICIAN",
        granteeType: "CLINICIAN",
        granteeId: clinicianId,
        revokedAt: null,
      },
      orderBy: { grantedAt: "desc" },
    }),
  ]);
  if (!assignment || !consent) return null;
  return { consentId: consent.id, categories: consent.categories };
}

export async function requireClinicianAccess(
  actor: Actor,
  patientId: string,
  action: string,
): Promise<ClinicianGrant & { clinicianId: string }> {
  const clinicianId = requireClinician(actor);
  const grant = await getClinicianGrant(clinicianId, patientId);
  if (!grant) {
    await audit(actor, { action, resourceType: "Patient", resourceId: patientId, subjectPatientId: patientId, outcome: "DENIED" });
    throw new AppError("FORBIDDEN", "You are not authorised to view this patient's information");
  }
  await audit(actor, { action, resourceType: "Patient", resourceId: patientId, subjectPatientId: patientId });
  return { ...grant, clinicianId };
}

/** Assignment-only check, used for referral/follow-up workflow actions (not record viewing). */
export async function requireAssignment(actor: Actor, patientId: string, action: string): Promise<string> {
  const clinicianId = requireClinician(actor);
  const assignment = await prisma.careAssignment.findFirst({ where: { clinicianId, patientId, status: "ACTIVE" } });
  if (!assignment) {
    await audit(actor, { action, resourceType: "Patient", resourceId: patientId, subjectPatientId: patientId, outcome: "DENIED" });
    throw new AppError("FORBIDDEN", "You are not assigned to this patient");
  }
  return clinicianId;
}

import { prisma } from "@/lib/db/prisma";
import { decrypt, encrypt } from "@/lib/crypto";
import type { Actor } from "@/lib/auth/session";
import { audit } from "./audit.service";
import { requireClinicianAccess } from "./access.service";

/**
 * Clinician-confirmed findings (formal diagnosis, care plan). Authored only by a clinician with an
 * active assignment and the patient's current sharing consent; never written by the AI. Entries
 * are append-only (a change is a new entry) and every write and read is audited.
 */
export async function listFindings(actor: Actor, patientId: string) {
  const { clinicianId } = await requireClinicianAccess(actor, patientId, "VIEW_CLINICIAN_FINDINGS");
  const rows = await prisma.clinicianFinding.findMany({
    where: { patientId, clinicianId },
    orderBy: { createdAt: "desc" },
  });
  const authors = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.authorUserId))] } }, select: { id: true, displayName: true } });
  const name = new Map(authors.map((a) => [a.id, a.displayName]));
  return rows.map((r) => ({ id: r.id, kind: r.kind, content: decrypt(r.contentEnc), createdAt: r.createdAt, author: name.get(r.authorUserId) ?? "Clinician" }));
}

export async function addFinding(actor: Actor, patientId: string, input: { kind: "DIAGNOSIS" | "CARE_PLAN"; content: string }) {
  const { clinicianId } = await requireClinicianAccess(actor, patientId, `RECORD_FINDING_${input.kind}`);
  const f = await prisma.clinicianFinding.create({
    data: { patientId, clinicianId, authorUserId: actor.userId, kind: input.kind, contentEnc: encrypt(input.content) },
  });
  await audit(actor, { action: `FINDING_CREATED_${input.kind}`, resourceType: "ClinicianFinding", resourceId: f.id, subjectPatientId: patientId });
  return { id: f.id, kind: f.kind, createdAt: f.createdAt };
}

import { prisma } from "@/lib/db/prisma";
import type { Actor } from "@/lib/auth/session";

export interface AuditEntry {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  subjectPatientId?: string | null;
  outcome?: "ALLOWED" | "DENIED";
}

/** Writes an audit record. Never pass content — only identifiers and action names. */
export async function audit(actor: Actor | null, entry: AuditEntry) {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: actor?.userId ?? null,
        actorRole: actor?.role ?? "SYSTEM",
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        subjectPatientId: entry.subjectPatientId ?? null,
        outcome: entry.outcome ?? "ALLOWED",
      },
    });
  } catch {
    console.error("[audit] failed to write audit record for action", entry.action);
  }
}

export async function recordSystemEvent(kind: string, code: string) {
  try {
    await prisma.systemEvent.create({ data: { kind, code } });
  } catch {
    console.error("[system-event] failed to record", kind, code);
  }
}

/** Access history for a patient's own data — transparency for the patient. */
export async function listAccessToMyData(patientId: string, take = 50) {
  return prisma.auditLog.findMany({
    where: { subjectPatientId: patientId, actorRole: { in: ["CLINICIAN", "ADMIN"] } },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      action: true,
      resourceType: true,
      outcome: true,
      createdAt: true,
      actor: { select: { displayName: true } },
    },
  });
}

/** Audit records produced by a clinician (their own accountability trail). */
export async function listAuditForClinician(userId: string, take = 100) {
  return prisma.auditLog.findMany({
    where: { actorUserId: userId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

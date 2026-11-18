import { prisma } from "@/lib/db/prisma";
import type { Actor } from "@/lib/auth/session";
import { POLICY_VERSION } from "@/features/consent/policy";

let n = 0;
const uid = () => `${Date.now().toString(36)}${(n++).toString(36)}`;

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
  }
}

export async function makePatient(name = "Test Patient"): Promise<Actor & { patientId: string }> {
  const u = await prisma.user.create({
    data: {
      email: `p-${uid()}@test.local`,
      passwordHash: "x",
      displayName: name,
      role: "PATIENT",
      patientProfile: { create: { preferredName: name, onboardingCompleted: true } },
    },
    include: { patientProfile: true },
  });
  await prisma.consentRecord.create({ data: { patientId: u.patientProfile!.id, scope: "AI_PROCESSING", categories: [], policyVersion: POLICY_VERSION } });
  return { userId: u.id, role: "PATIENT", displayName: name, isDemo: false, patientId: u.patientProfile!.id, clinicianId: null };
}

export async function makeClinician(name = "Dr Test"): Promise<Actor & { clinicianId: string }> {
  const u = await prisma.user.create({
    data: {
      email: `c-${uid()}@test.local`,
      passwordHash: "x",
      displayName: name,
      role: "CLINICIAN",
      clinicianProfile: { create: { title: "Psychiatrist", specialty: "Adult", organization: "Test", licenseNumber: uid() } },
    },
    include: { clinicianProfile: true },
  });
  return { userId: u.id, role: "CLINICIAN", displayName: name, isDemo: false, patientId: null, clinicianId: u.clinicianProfile!.id };
}

export async function assign(patientId: string, clinicianId: string) {
  return prisma.careAssignment.create({ data: { patientId, clinicianId } });
}

export async function grantClinicianConsent(patientId: string, clinicianId: string, categories: string[]) {
  return prisma.consentRecord.create({
    data: { patientId, scope: "SHARE_SUMMARY_WITH_CLINICIAN", granteeType: "CLINICIAN", granteeId: clinicianId, categories, policyVersion: POLICY_VERSION },
  });
}

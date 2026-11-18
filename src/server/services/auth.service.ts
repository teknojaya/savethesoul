import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";
import { getDummyHash, hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { encrypt } from "@/lib/crypto";
import { POLICY_VERSION } from "@/features/consent/policy";
import type { z } from "zod";
import type { LoginSchema, RegisterSchema } from "@/lib/validation/schemas";

/**
 * Public registration only ever creates PATIENT accounts. Clinician accounts are
 * provisioned by an administrator (seed script in the prototype) after licence checks.
 */
export async function registerPatient(input: z.infer<typeof RegisterSchema>) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new AppError("CONFLICT", "An account with this email already exists");
  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      displayName: input.preferredName,
      role: "PATIENT",
      patientProfile: { create: { preferredName: input.preferredName } },
    },
  });
  return createSession(user.id);
}

export async function login(input: z.infer<typeof LoginSchema>) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  // Always run a bcrypt comparison so response time doesn't reveal whether an account exists.
  const ok = await verifyPassword(input.password, user?.passwordHash ?? getDummyHash());
  if (!user || !ok) throw new AppError("UNAUTHENTICATED", "Email or password is incorrect");
  const session = await createSession(user.id);
  return { ...session, role: user.role };
}

export async function completeOnboarding(
  patientId: string,
  input: {
    chatHistoryEnabled: boolean;
    memoryEnabled: boolean;
    aggregateAnalytics: boolean;
    ageBand?: string | null;
  },
) {
  await prisma.$transaction(async (tx) => {
    await tx.patientProfile.update({
      where: { id: patientId },
      data: {
        onboardingCompleted: true,
        chatHistoryEnabled: input.chatHistoryEnabled,
        memoryEnabled: input.memoryEnabled,
        ageBand: input.ageBand ?? null,
      },
    });
    const scopes: ("AI_PROCESSING" | "WELLBEING_MEMORY" | "AGGREGATE_ANALYTICS")[] = ["AI_PROCESSING"];
    if (input.memoryEnabled) scopes.push("WELLBEING_MEMORY");
    if (input.aggregateAnalytics) scopes.push("AGGREGATE_ANALYTICS");
    for (const scope of scopes) {
      const active = await tx.consentRecord.findFirst({ where: { patientId, scope, revokedAt: null } });
      if (!active) {
        await tx.consentRecord.create({
          data: { patientId, scope, categories: [], policyVersion: POLICY_VERSION },
        });
      }
    }
  });
}

export async function updatePreferences(
  patientId: string,
  input: { chatHistoryEnabled?: boolean; memoryEnabled?: boolean; preferredName?: string; physicalHealthContext?: string | null },
) {
  await prisma.$transaction(async (tx) => {
    await tx.patientProfile.update({
      where: { id: patientId },
      data: {
        chatHistoryEnabled: input.chatHistoryEnabled,
        memoryEnabled: input.memoryEnabled,
        preferredName: input.preferredName,
        physicalHealthEnc:
          input.physicalHealthContext === undefined
            ? undefined
            : input.physicalHealthContext
              ? encrypt(input.physicalHealthContext)
              : null,
      },
    });
    if (input.memoryEnabled === true) {
      const active = await tx.consentRecord.findFirst({ where: { patientId, scope: "WELLBEING_MEMORY", revokedAt: null } });
      if (!active) {
        await tx.consentRecord.create({ data: { patientId, scope: "WELLBEING_MEMORY", categories: [], policyVersion: POLICY_VERSION } });
      }
    }
    if (input.memoryEnabled === false) {
      // Turning memory off revokes consent AND deletes stored memories.
      await tx.consentRecord.updateMany({ where: { patientId, scope: "WELLBEING_MEMORY", revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.wellbeingMemory.deleteMany({ where: { patientId } });
    }
    if (input.chatHistoryEnabled === false) {
      // Turning history off deletes existing stored conversations.
      await tx.conversation.deleteMany({ where: { patientId } });
    }
  });
}

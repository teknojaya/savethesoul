import { prisma } from "@/lib/db/prisma";
import { decrypt, decryptOptional, encrypt, encryptOptional } from "@/lib/crypto";
import { notFound } from "@/lib/errors";
import {
  buildContactMessage,
  decideContactNotification,
  POLICY_VERSION,
} from "@/features/consent/policy";
import type { z } from "zod";
import type { NotifySchema, TrustedContactSchema, TrustedContactUpdateSchema } from "@/lib/validation/schemas";

type ContactInput = z.infer<typeof TrustedContactSchema>;

function present(c: Awaited<ReturnType<typeof prisma.trustedContact.findFirstOrThrow>>) {
  return {
    id: c.id,
    name: c.name,
    relationship: c.relationship,
    phone: decryptOptional(c.phoneEnc),
    email: decryptOptional(c.emailEnc),
    canReceiveUpdates: c.canReceiveUpdates,
    canReceiveSafetyAlerts: c.canReceiveSafetyAlerts,
    sharedCategories: c.sharedCategories,
    isSafetyPlanContact: c.isSafetyPlanContact,
    recipientVerified: c.recipientVerified,
    createdAt: c.createdAt,
  };
}

export async function listContacts(patientId: string) {
  const rows = await prisma.trustedContact.findMany({ where: { patientId, revokedAt: null }, orderBy: { createdAt: "asc" } });
  return rows.map(present);
}

/** Adds a contact and records a matching, category-scoped sharing consent. */
export async function addContact(patientId: string, input: ContactInput) {
  return prisma.$transaction(async (tx) => {
    const c = await tx.trustedContact.create({
      data: {
        patientId,
        name: input.name,
        relationship: input.relationship,
        phoneEnc: encryptOptional(input.phone || null),
        emailEnc: encryptOptional(input.email || null),
        canReceiveUpdates: input.canReceiveUpdates,
        canReceiveSafetyAlerts: input.canReceiveSafetyAlerts,
        sharedCategories: input.sharedCategories,
        isSafetyPlanContact: input.isSafetyPlanContact,
      },
    });
    if (input.sharedCategories.length) {
      await tx.consentRecord.create({
        data: {
          patientId,
          scope: "TRUSTED_CONTACT_SHARING",
          granteeType: "TRUSTED_CONTACT",
          granteeId: c.id,
          categories: input.sharedCategories,
          policyVersion: POLICY_VERSION,
        },
      });
    }
    return present(c);
  });
}

/**
 * Updates permissions. Any change to shared categories revokes the previous consent and
 * (if categories remain) records a fresh one, keeping the consent ledger append-only.
 */
export async function updateContact(patientId: string, contactId: string, input: z.infer<typeof TrustedContactUpdateSchema>) {
  const existing = await prisma.trustedContact.findFirst({ where: { id: contactId, patientId, revokedAt: null } });
  if (!existing) throw notFound("Contact not found");
  return prisma.$transaction(async (tx) => {
    const c = await tx.trustedContact.update({
      where: { id: contactId },
      data: {
        name: input.name,
        relationship: input.relationship,
        phoneEnc: input.phone === undefined ? undefined : encryptOptional(input.phone || null),
        emailEnc: input.email === undefined ? undefined : encryptOptional(input.email || null),
        canReceiveUpdates: input.canReceiveUpdates,
        canReceiveSafetyAlerts: input.canReceiveSafetyAlerts,
        sharedCategories: input.sharedCategories,
        isSafetyPlanContact: input.isSafetyPlanContact,
      },
    });
    if (input.sharedCategories) {
      await tx.consentRecord.updateMany({
        where: { patientId, scope: "TRUSTED_CONTACT_SHARING", granteeId: contactId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (input.sharedCategories.length) {
        await tx.consentRecord.create({
          data: {
            patientId,
            scope: "TRUSTED_CONTACT_SHARING",
            granteeType: "TRUSTED_CONTACT",
            granteeId: contactId,
            categories: input.sharedCategories,
            policyVersion: POLICY_VERSION,
          },
        });
      }
    }
    return present(c);
  });
}

/** Removes a contact and revokes all of its sharing consents. */
export async function removeContact(patientId: string, contactId: string) {
  const existing = await prisma.trustedContact.findFirst({ where: { id: contactId, patientId, revokedAt: null } });
  if (!existing) throw notFound("Contact not found");
  const now = new Date();
  await prisma.$transaction([
    prisma.trustedContact.update({ where: { id: contactId }, data: { revokedAt: now } }),
    prisma.consentRecord.updateMany({
      where: { patientId, granteeType: "TRUSTED_CONTACT", granteeId: contactId, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);
}

/**
 * Previews or performs a SIMULATED notification. Nothing is ever delivered to a real
 * phone or inbox by the prototype. Blocked attempts are recorded so the safeguard is visible.
 */
export async function notifyContact(
  patientId: string,
  contactId: string,
  input: z.infer<typeof NotifySchema>,
) {
  const [contact, consents, profile] = await Promise.all([
    prisma.trustedContact.findFirst({ where: { id: contactId, patientId } }),
    prisma.consentRecord.findMany({ where: { patientId, granteeType: "TRUSTED_CONTACT", granteeId: contactId } }),
    prisma.patientProfile.findUniqueOrThrow({ where: { id: patientId } }),
  ]);
  if (!contact) throw notFound("Contact not found");

  const decision = decideContactNotification({
    contact,
    consents,
    kind: input.kind,
    category: input.category,
    initiatedByPatient: true,
  });
  const message = buildContactMessage(input.category, profile.preferredName, contact.name);

  if (input.dryRun) return { preview: message, decision, simulated: true as const };

  const record = await prisma.contactNotification.create({
    data: {
      patientId,
      trustedContactId: contactId,
      kind: input.kind,
      messageEnc: encrypt(message),
      status: decision.allowed ? "SIMULATED_SENT" : "BLOCKED",
      blockedReason: decision.allowed ? null : decision.reason,
      simulated: true,
    },
  });
  return { preview: message, decision, simulated: true as const, notificationId: record.id };
}

export async function listNotifications(patientId: string) {
  const rows = await prisma.contactNotification.findMany({
    where: { patientId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { trustedContact: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    contactName: r.trustedContact.name,
    kind: r.kind,
    status: r.status,
    blockedReason: r.blockedReason,
    message: decrypt(r.messageEnc),
    simulated: r.simulated,
    createdAt: r.createdAt,
  }));
}

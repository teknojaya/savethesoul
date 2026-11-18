import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";
import { resetEnvCache } from "@/lib/env";
import { setProviderOverride } from "@/features/ai/provider-factory";
import { ProviderError, type ChatProvider } from "@/features/ai/types";
import { sendMessage, startConversation, getConversation } from "@/server/services/conversation.service";
import { addContact, notifyContact, removeContact, updateContact } from "@/server/services/trusted-circle.service";
import { revokeConsent } from "@/server/services/consent.service";
import { createReferral, transitionReferral, simulateReferralAcknowledgement } from "@/server/services/referral.service";
import { sendSimulatedCareTeamAlert, acknowledgeAlert, createSelfReportedEvent, simulateAcknowledgement } from "@/server/services/safety.service";
import { addMemory, listMemories, submitWho5 } from "@/server/services/wellbeing.service";
import { updatePreferences } from "@/server/services/auth.service";
import { exportPatientData, deletePatientAccount } from "@/server/services/privacy.service";
import { updateFollowUp } from "@/server/services/clinician.service";
import { assign, makeClinician, makePatient, resetDb } from "../support/fixtures";

beforeEach(resetDb);
afterEach(() => setProviderOverride(null));
afterAll(() => prisma.$disconnect());

async function run(gen: AsyncGenerator<{ type: string }>) {
  const events: Record<string, unknown>[] = [];
  for await (const e of gen) events.push(e as Record<string, unknown>);
  return events;
}

const failing = (code: ProviderError["code"]): ChatProvider => ({
  id: "failing",
  label: "failing",
  isGenerative: true,
  async *stream() {
    throw new ProviderError(code, "simulated outage");
  },
  async complete() {
    throw new ProviderError(code, "simulated outage");
  },
});

describe("Crisis response routing (persisted)", () => {
  it("routes explicit danger to the crisis template and records a content-free safety event", async () => {
    const p = await makePatient();
    const c = await startConversation(p.patientId);
    const text = "I'm going to kill myself tonight";
    const events = await run(sendMessage(p.patientId, c.id, text));

    expect(events.find((e) => e.type === "safety")).toMatchObject({ mode: "crisis" });
    const saved = events.find((e) => e.type === "saved") as { safetyEventId: string };
    const se = await prisma.safetyEvent.findUniqueOrThrow({ where: { id: saved.safetyEventId } });
    expect(se.level).toBe("IMMEDIATE_DANGER");
    expect(se.categories).toContain("SUICIDE_INTENT_IMMINENT");
    expect(JSON.stringify(se)).not.toContain("kill myself");

    const msgs = await prisma.chatMessage.findMany({ where: { conversationId: c.id }, orderBy: { createdAt: "asc" } });
    expect(msgs.map((m) => m.role)).toEqual(["USER", "SAFETY"]);
    expect(msgs[0].contentEnc).not.toContain("kill");
    expect(msgs[1].provider).toBe("safety-template");
    // Nobody is contacted automatically
    expect(se.simulatedAlertAt).toBeNull();
    expect(await prisma.contactNotification.count()).toBe(0);
  });

  it("does not store conversation text in the title", async () => {
    const p = await makePatient();
    const c = await startConversation(p.patientId);
    await run(sendMessage(p.patientId, c.id, "my secret worry about my marriage"));
    const convo = await prisma.conversation.findUniqueOrThrow({ where: { id: c.id } });
    expect(convo.title).not.toMatch(/secret|marriage/);
  });
});

describe("LLM failure fallback (persisted)", () => {
  it("stores a safe fallback and records an operational event when the LLM is down", async () => {
    setProviderOverride(failing("UNAVAILABLE"));
    const p = await makePatient();
    const c = await startConversation(p.patientId);
    const events = await run(sendMessage(p.patientId, c.id, "Hi, I had a hard day"));
    expect(events.find((e) => e.type === "done")).toMatchObject({ producedBy: "fallback", providerError: "UNAVAILABLE" });
    const convo = await getConversation(p.patientId, c.id);
    expect(convo.messages.at(-1)).toMatchObject({ role: "ASSISTANT", provider: "fallback" });
    expect(convo.messages.at(-1)?.content).toMatch(/800-SAKINA/);
    expect(await prisma.systemEvent.count({ where: { kind: "LLM_ERROR", code: "UNAVAILABLE" } })).toBe(1);
  });

  it("still delivers the crisis template when the LLM is down", async () => {
    setProviderOverride(failing("TIMEOUT"));
    const p = await makePatient();
    const c = await startConversation(p.patientId);
    const events = await run(sendMessage(p.patientId, c.id, "I've taken all my pills"));
    expect(events.find((e) => e.type === "done")).toMatchObject({ producedBy: "safety-template" });
    expect(await prisma.systemEvent.count()).toBe(0); // LLM never called
  });
});

describe("Simulated care-team alerts & failed hand-offs", () => {
  it("records a failed hand-off when no care team is connected", async () => {
    const p = await makePatient();
    const e = await createSelfReportedEvent(p.patientId, "IMMEDIATE_DANGER");
    const res = await sendSimulatedCareTeamAlert(p.patientId, e.id);
    expect(res).toMatchObject({ status: "HANDOFF_FAILED", simulated: true });
    const se = await prisma.safetyEvent.findUniqueOrThrow({ where: { id: e.id } });
    expect(se).toMatchObject({ workflowStatus: "HANDOFF_FAILED", failureReason: "NO_CARE_TEAM_CONNECTED" });
  });

  it("sends a simulated alert to the assigned clinician who can acknowledge it", async () => {
    const p = await makePatient();
    const doc = await makeClinician();
    const stranger = await makeClinician("Stranger");
    await assign(p.patientId, doc.clinicianId);
    const e = await createSelfReportedEvent(p.patientId, "IMMEDIATE_DANGER");
    const res = await sendSimulatedCareTeamAlert(p.patientId, e.id);
    expect(res).toMatchObject({ status: "SIMULATED_ALERT_SENT", simulated: true });

    await expect(acknowledgeAlert(stranger, e.id)).rejects.toBeInstanceOf(AppError);
    await acknowledgeAlert(doc, e.id);
    const se = await prisma.safetyEvent.findUniqueOrThrow({ where: { id: e.id } });
    expect(se.workflowStatus).toBe("SIMULATED_ACKNOWLEDGED");
    await expect(acknowledgeAlert(doc, e.id)).rejects.toBeInstanceOf(AppError);
  });

  it("refuses demo-only simulation when DEMO_MODE is off", async () => {
    const p = await makePatient();
    const doc = await makeClinician();
    await assign(p.patientId, doc.clinicianId);
    const e = await createSelfReportedEvent(p.patientId, "IMMEDIATE_DANGER");
    await sendSimulatedCareTeamAlert(p.patientId, e.id);
    process.env.DEMO_MODE = "false";
    resetEnvCache();
    try {
      await expect(simulateAcknowledgement(p.patientId, e.id)).rejects.toBeInstanceOf(AppError);
    } finally {
      process.env.DEMO_MODE = "true";
      resetEnvCache();
    }
  });

  it("a patient cannot alert on someone else's safety event", async () => {
    const a = await makePatient("A");
    const b = await makePatient("B");
    const e = await createSelfReportedEvent(a.patientId, "IMMEDIATE_DANGER");
    await expect(sendSimulatedCareTeamAlert(b.patientId, e.id)).rejects.toBeInstanceOf(AppError);
  });
});

describe("Trusted circle consent & simulated notifications", () => {
  const contactInput = {
    name: "Mariam",
    relationship: "Sibling" as const,
    phone: "+971500000000",
    email: null,
    canReceiveUpdates: true,
    canReceiveSafetyAlerts: false,
    sharedCategories: ["CHECK_IN_REQUEST" as const],
    isSafetyPlanContact: true,
  };

  it("previews, simulates sending, and blocks after consent revocation", async () => {
    const p = await makePatient("Layla");
    const contact = await addContact(p.patientId, contactInput);

    const preview = await notifyContact(p.patientId, contact.id, { kind: "ORDINARY_UPDATE", category: "CHECK_IN_REQUEST", dryRun: true });
    expect(preview.decision.allowed).toBe(true);
    expect(preview.preview).toContain("Layla");
    expect(await prisma.contactNotification.count()).toBe(0); // dry run stores nothing

    const sent = await notifyContact(p.patientId, contact.id, { kind: "ORDINARY_UPDATE", category: "CHECK_IN_REQUEST", dryRun: false });
    expect(sent.decision).toEqual({ allowed: true, delivery: "SIMULATED" });

    const consent = await prisma.consentRecord.findFirstOrThrow({ where: { granteeId: contact.id, revokedAt: null } });
    await revokeConsent(p.patientId, consent.id);
    const blocked = await notifyContact(p.patientId, contact.id, { kind: "ORDINARY_UPDATE", category: "CHECK_IN_REQUEST", dryRun: false });
    expect(blocked.decision.allowed).toBe(false);

    const rows = await prisma.contactNotification.findMany({ orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => r.status)).toEqual(["SIMULATED_SENT", "BLOCKED"]);
    expect(rows.every((r) => r.simulated)).toBe(true);
  });

  it("changing shared categories re-scopes consent; removing a contact revokes all consent", async () => {
    const p = await makePatient();
    const contact = await addContact(p.patientId, contactInput);
    await updateContact(p.patientId, contact.id, { sharedCategories: ["GENERAL_UPDATE"] });
    const blockedOld = await notifyContact(p.patientId, contact.id, { kind: "ORDINARY_UPDATE", category: "CHECK_IN_REQUEST", dryRun: true });
    expect(blockedOld.decision.allowed).toBe(false);
    const allowedNew = await notifyContact(p.patientId, contact.id, { kind: "ORDINARY_UPDATE", category: "GENERAL_UPDATE", dryRun: true });
    expect(allowedNew.decision.allowed).toBe(true);

    await removeContact(p.patientId, contact.id);
    expect(await prisma.consentRecord.count({ where: { granteeId: contact.id, revokedAt: null } })).toBe(0);
  });

  it("blocks safety messages to a contact without that permission", async () => {
    const p = await makePatient();
    const contact = await addContact(p.patientId, contactInput);
    const r = await notifyContact(p.patientId, contact.id, { kind: "SAFETY_ALERT", category: "CHECK_IN_REQUEST", dryRun: false });
    expect(r.decision.allowed).toBe(false);
  });

  it("stores contact details encrypted", async () => {
    const p = await makePatient();
    await addContact(p.patientId, contactInput);
    const raw = await prisma.trustedContact.findFirstOrThrow();
    expect(raw.phoneEnc).not.toContain("971500000000");
  });
});

describe("Personal memory consent", () => {
  it("requires memory consent and deletes memories when turned off", async () => {
    const p = await makePatient();
    await expect(addMemory(p.patientId, "walks help")).rejects.toMatchObject({ code: "CONSENT_REQUIRED" });
    await updatePreferences(p.patientId, { memoryEnabled: true });
    await addMemory(p.patientId, "walks help");
    expect(await listMemories(p.patientId)).toHaveLength(1);
    await updatePreferences(p.patientId, { memoryEnabled: false });
    expect(await listMemories(p.patientId)).toHaveLength(0);
    expect(await prisma.consentRecord.count({ where: { patientId: p.patientId, scope: "WELLBEING_MEMORY", revokedAt: null } })).toBe(0);
  });
});

describe("Referral workflow", () => {
  it("runs REQUESTED → ACKNOWLEDGED → SCHEDULED → COMPLETED with events and a follow-up", async () => {
    const p = await makePatient();
    const doc = await makeClinician();
    const r = await createReferral(p.patientId, { clinicianId: doc.clinicianId, urgency: "SOON", reason: "sleep" });
    expect(r.status).toBe("REQUESTED");
    expect(r.isSimulated).toBe(true);

    const ack = await transitionReferral(doc, r.id, "ACKNOWLEDGED", {});
    expect(ack.firstContactAt).not.toBeNull();
    await expect(transitionReferral(doc, r.id, "SCHEDULED", {})).rejects.toMatchObject({ code: "VALIDATION" });
    const sched = await transitionReferral(doc, r.id, "SCHEDULED", { scheduledFor: new Date(Date.now() + 86_400_000) });
    expect(sched.followUps).toHaveLength(1);
    const done = await transitionReferral(doc, r.id, "COMPLETED", {});
    expect(done.status).toBe("COMPLETED");
    expect(done.completedAt).not.toBeNull();
    expect(done.events.map((e) => e.toStatus)).toEqual(["REQUESTED", "ACKNOWLEDGED", "SCHEDULED", "COMPLETED"]);

    await expect(transitionReferral(doc, r.id, "ACKNOWLEDGED", {})).rejects.toMatchObject({ code: "INVALID_TRANSITION" });

    const fu = sched.followUps[0];
    await updateFollowUp(doc, fu.id, { status: "COMPLETED", functioningChange: 1 });
    expect(await prisma.followUp.findUniqueOrThrow({ where: { id: fu.id } })).toMatchObject({ status: "COMPLETED", functioningChange: 1 });
  });

  it("blocks clinicians who are not the referral's clinician, and patients from clinician-only steps", async () => {
    const p = await makePatient();
    const doc = await makeClinician();
    const other = await makeClinician("Other");
    const r = await createReferral(p.patientId, { clinicianId: doc.clinicianId, urgency: "ROUTINE" });
    await expect(transitionReferral(other, r.id, "ACKNOWLEDGED", {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(transitionReferral(p, r.id, "ACKNOWLEDGED", {})).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    const cancelled = await transitionReferral(p, r.id, "CANCELLED", {});
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("labels simulated acknowledgements explicitly", async () => {
    const p = await makePatient();
    const res = await prisma.supportResource.create({
      data: { slug: "x", name: "X", category: "PRIMARY_CARE", description: "d", nextSteps: "n", verificationStatus: "NEEDS_VERIFICATION" },
    });
    const r = await createReferral(p.patientId, { resourceId: res.id, urgency: "ROUTINE" });
    const ack = await simulateReferralAcknowledgement(p.patientId, r.id);
    const ev = ack.events.at(-1)!;
    expect(ev.actorRole).toBe("SIMULATION");
    expect(ev.note).toMatch(/SIMULATED/);
    expect(ev.note).toMatch(/No real provider/);
  });
});

describe("Data export & deletion", () => {
  it("exports decrypted data and permanently deletes the account", async () => {
    const p = await makePatient();
    const c = await startConversation(p.patientId);
    await run(sendMessage(p.patientId, c.id, "work stress"));
    await submitWho5(p.patientId, [1, 2, 3, 4, 5]);

    const exp = await exportPatientData(p);
    expect(exp.conversations[0].messages[0].content).toBe("work stress");
    expect(exp.who5Assessments).toHaveLength(1);

    await deletePatientAccount(p);
    expect(await prisma.user.findUnique({ where: { id: p.userId } })).toBeNull();
    expect(await prisma.patientProfile.count({ where: { id: p.patientId } })).toBe(0);
    expect(await prisma.chatMessage.count()).toBe(0);
    expect(await prisma.wellbeingAssessment.count()).toBe(0);
    expect(await prisma.consentRecord.count({ where: { patientId: p.patientId } })).toBe(0);
    // Accountability: an audit entry with only the opaque subject id survives
    const audit = await prisma.auditLog.findFirst({ where: { action: "DELETE_OWN_ACCOUNT", subjectPatientId: p.patientId } });
    expect(audit).not.toBeNull();
  });

  it("turning off chat history deletes stored conversations", async () => {
    const p = await makePatient();
    await startConversation(p.patientId);
    await updatePreferences(p.patientId, { chatHistoryEnabled: false });
    expect(await prisma.conversation.count({ where: { patientId: p.patientId } })).toBe(0);
    const ephemeral = await startConversation(p.patientId);
    expect(ephemeral.ephemeral).toBe(true);
  });
});

import { setProviderOverride } from "@/features/ai/provider-factory";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";
import { getPatientDetail, addClinicianNote, listAssignedPatients } from "@/server/services/clinician.service";
import { getConversation, startConversation } from "@/server/services/conversation.service";
import { revokeConsent } from "@/server/services/consent.service";
import { shareSummary, listSummariesForClinician, stopSharingWithClinician, markDraftReviewed } from "@/server/services/summary.service";
import { submitWho5, addCheckIn } from "@/server/services/wellbeing.service";
import { updatePreferences } from "@/server/services/auth.service";
import { assign, grantClinicianConsent, makeClinician, makePatient, resetDb } from "../support/fixtures";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toSatisfy((e) => e instanceof AppError && e.code === code);
}

describe("Clinician access restrictions", () => {
  it("denies a clinician with no assignment, and audits the denial", async () => {
    const patient = await makePatient();
    const doc = await makeClinician();
    await grantClinicianConsent(patient.patientId, doc.clinicianId, ["WHO5_HISTORY"]);
    await expectCode(getPatientDetail(doc, patient.patientId), "FORBIDDEN");
    const denied = await prisma.auditLog.findFirst({ where: { actorUserId: doc.userId, outcome: "DENIED", subjectPatientId: patient.patientId } });
    expect(denied).not.toBeNull();
  });

  it("denies an assigned clinician without the patient's sharing consent", async () => {
    const patient = await makePatient();
    const doc = await makeClinician();
    await assign(patient.patientId, doc.clinicianId);
    await expectCode(getPatientDetail(doc, patient.patientId), "FORBIDDEN");
    await expectCode(addClinicianNote(doc, patient.patientId, "note"), "FORBIDDEN");
  });

  it("denies a consent granted to a DIFFERENT clinician", async () => {
    const patient = await makePatient();
    const docA = await makeClinician("A");
    const docB = await makeClinician("B");
    await assign(patient.patientId, docB.clinicianId);
    await grantClinicianConsent(patient.patientId, docA.clinicianId, ["WHO5_HISTORY"]);
    await expectCode(getPatientDetail(docB, patient.patientId), "FORBIDDEN");
  });

  it("returns only the categories the patient shared", async () => {
    const patient = await makePatient();
    const doc = await makeClinician();
    await submitWho5(patient.patientId, [3, 3, 3, 3, 3]);
    await addCheckIn(patient.patientId, { mood: 2, stress: 4, sleepQuality: 2, functioning: 3, note: "private note" });
    await updatePreferences(patient.patientId, { physicalHealthContext: "Asthma" });
    await assign(patient.patientId, doc.clinicianId);
    await grantClinicianConsent(patient.patientId, doc.clinicianId, ["WHO5_HISTORY"]);

    const d = await getPatientDetail(doc, patient.patientId);
    expect(d.assessments).toHaveLength(1);
    expect(d.checkIns).toBeNull();
    expect(d.patient.physicalHealthContext).toBeNull();
    expect(JSON.stringify(d)).not.toContain("private note");
    const allowed = await prisma.auditLog.findFirst({ where: { actorUserId: doc.userId, action: "VIEW_PATIENT_DETAIL", outcome: "ALLOWED" } });
    expect(allowed).not.toBeNull();
  });

  it("shares only selected check-in fields", async () => {
    const patient = await makePatient();
    const doc = await makeClinician();
    await addCheckIn(patient.patientId, { mood: 2, stress: 5, sleepQuality: 1, functioning: 3 });
    await assign(patient.patientId, doc.clinicianId);
    await grantClinicianConsent(patient.patientId, doc.clinicianId, ["MOOD_TRENDS"]);
    const d = await getPatientDetail(doc, patient.patientId);
    expect(d.checkIns?.[0]).toMatchObject({ mood: 2, stress: null, sleepQuality: null, functioning: null });
  });

  it("removes access immediately when consent is revoked", async () => {
    const patient = await makePatient();
    const doc = await makeClinician();
    await submitWho5(patient.patientId, [2, 2, 2, 2, 2]);
    await shareSummary(patient.patientId, doc.clinicianId, ["WHO5_HISTORY"], null);
    expect((await getPatientDetail(doc, patient.patientId)).summaries).toHaveLength(1);

    const consent = await prisma.consentRecord.findFirstOrThrow({ where: { patientId: patient.patientId, scope: "SHARE_SUMMARY_WITH_CLINICIAN", revokedAt: null } });
    await revokeConsent(patient.patientId, consent.id);

    await expectCode(getPatientDetail(doc, patient.patientId), "FORBIDDEN");
    const s = await prisma.clinicalSummary.findFirstOrThrow({ where: { patientId: patient.patientId } });
    expect(s.status).toBe("REVOKED");
    const list = await listAssignedPatients(doc);
    expect(list[0]).toMatchObject({ hasConsent: false, latestWho5: null, ageBand: null });
  });

  it("a newer share supersedes the older snapshot, and stop-sharing revokes everything", async () => {
    const patient = await makePatient();
    const doc = await makeClinician();
    await updatePreferences(patient.patientId, { physicalHealthContext: "Diabetes" });
    await shareSummary(patient.patientId, doc.clinicianId, ["WHO5_HISTORY", "PHYSICAL_HEALTH_CONTEXT"], null);
    const second = await shareSummary(patient.patientId, doc.clinicianId, ["WHO5_HISTORY"], null);

    const visible = await listSummariesForClinician(doc, patient.patientId);
    expect(visible.map((s) => s.id)).toEqual([second.id]);
    expect(JSON.stringify(visible)).not.toContain("Diabetes");

    await stopSharingWithClinician(patient.patientId, second.id);
    await expectCode(getPatientDetail(doc, patient.patientId), "FORBIDDEN");
  });

  it("labels the AI draft unverified until a clinician reviews it", async () => {
    const patient = await makePatient();
    const doc = await makeClinician();
    await submitWho5(patient.patientId, [2, 2, 2, 2, 2]);
    // A generative model is needed for an AI draft (the offline demo never produces one).
    setProviderOverride({ id: "openai", label: "test", model: "test", isGenerative: true, async *stream() {}, complete: async () => "Synthetic AI draft [WHO-5]" });
    const s = await shareSummary(patient.patientId, doc.clinicianId, ["WHO5_HISTORY"], null);
    setProviderOverride(null);
    const before = await prisma.clinicalSummary.findUniqueOrThrow({ where: { id: s.id } });
    expect(before.aiDraftStatus).toBe("UNVERIFIED");
    await markDraftReviewed(doc, s.id);
    const after = await prisma.clinicalSummary.findUniqueOrThrow({ where: { id: s.id } });
    expect(after.aiDraftStatus).toBe("REVIEWED");
    expect(after.reviewedByUserId).toBe(doc.userId);

    const other = await makeClinician("Other");
    await expectCode(markDraftReviewed(other, s.id), "FORBIDDEN");
  });

  it("never exposes conversations to clinicians", async () => {
    const patient = await makePatient();
    const doc = await makeClinician();
    await shareSummary(patient.patientId, doc.clinicianId, ["WHO5_HISTORY", "MOOD_TRENDS", "SLEEP_STRESS", "FUNCTIONING", "GOALS", "PHYSICAL_HEALTH_CONTEXT", "PATIENT_NOTE"], "note");
    const d = await getPatientDetail(doc, patient.patientId);
    expect(Object.keys(d)).not.toContain("conversations");
  });
});

describe("Patient authorization boundaries", () => {
  it("a patient cannot read another patient's conversation", async () => {
    const a = await makePatient("A");
    const b = await makePatient("B");
    const convo = await startConversation(a.patientId);
    await expectCode(getConversation(b.patientId, convo.id), "NOT_FOUND");
    await expect(getConversation(a.patientId, convo.id)).resolves.toMatchObject({ id: convo.id });
  });

  it("a patient cannot revoke another patient's consent", async () => {
    const a = await makePatient("A");
    const b = await makePatient("B");
    const consent = await prisma.consentRecord.findFirstOrThrow({ where: { patientId: a.patientId } });
    await expectCode(revokeConsent(b.patientId, consent.id), "NOT_FOUND");
  });
});

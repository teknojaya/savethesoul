import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { encrypt } from "@/lib/crypto";
import { resetEnvCache } from "@/lib/env";
import { resetRateLimits } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";
import { POLICY_VERSION } from "@/features/consent/policy";
import { setProviderOverride } from "@/features/ai/provider-factory";
import type { ChatProvider, GenerateInput } from "@/features/ai/types";
import { CI_SYSTEM_PROMPT } from "@/features/clinical-intelligence/engine";
import { sendMessage, startConversation } from "@/server/services/conversation.service";
import { shareSummary } from "@/server/services/summary.service";
import {
  addClinicianGoal,
  analyze,
  careGoalsForSakinah,
  clinicianReview,
  getPatientInsights,
  getSharedInsightForClinician,
  patientReview,
  setConsent,
  settleAnalyses,
} from "@/server/services/clinical-intelligence.service";
import { makeClinician, makePatient, resetDb } from "../support/fixtures";

/** Clinical Intelligence end-to-end at service level. Synthetic data only; fake model. */
const SAID = "I've been constantly worried about my work, I struggle to sleep, and lately I can't concentrate. It's been happening for about three weeks.";

function fakeModel(extraction: (input: GenerateInput) => object) {
  const calls = { chat: [] as GenerateInput[], ci: [] as GenerateInput[] };
  const p: ChatProvider = {
    id: "openai",
    label: "test",
    model: "test-model",
    isGenerative: true,
    async *stream(input) {
      calls.chat.push(input);
      yield "That sounds really hard. How has your sleep been this week?";
    },
    async complete(input) {
      if (input.system === CI_SYSTEM_PROMPT) {
        calls.ci.push(input);
        return JSON.stringify(extraction(input));
      }
      calls.chat.push(input);
      return "ok";
    },
  };
  setProviderOverride(p);
  return calls;
}
/** Extraction that cites the first provided message (M1). */
const standard = () => ({
  presentingConcerns: [{ text: "Reports constant worry about work.", category: "WORRY", quote: "constantly worried about my work", messageRef: "M1" }],
  reportedSymptoms: [
    { text: "Reports difficulty sleeping.", category: "SLEEP", quote: "I struggle to sleep", messageRef: "M1" },
    { text: "Reports difficulty concentrating.", category: "CONCENTRATION", quote: "lately I can't concentrate", messageRef: "M1" },
    { text: "Reports panic attacks.", category: "WORRY", quote: "I get panic attacks", messageRef: "M1" }, // fabricated
  ],
  durationAndFrequency: [{ text: "Reports this has lasted about three weeks.", category: "OTHER", quote: "happening for about three weeks", messageRef: "M1" }],
  functioningImpact: [],
  contextAndCoping: [],
  reportedChanges: [],
  possibleConsiderations: [
    { text: "Ongoing worry, sleep and concentration difficulty may warrant professional evaluation for anxiety-related difficulties.", basedOn: ["M1"] },
    { text: "Consider assessing for generalized anxiety disorder.", basedOn: ["M1"] }, // disorder name → removed
  ],
  missingInformation: ["Severity and any medical or environmental factors"],
  reviewQuestions: ["What might be keeping the worry going at night?"],
});

async function chat(patientId: string, text: string, conversationId?: string) {
  const convo = conversationId ?? (await startConversation(patientId)).id;
  for await (const ev of sendMessage(patientId, convo, text, { aiAllowed: true })) void ev;
  await settleAnalyses(); // background analysis after chat (if consented) has finished
  return convo;
}
const insights = (patientId: string) => prisma.clinicalInsight.findMany({ where: { patientId }, orderBy: { createdAt: "asc" } });

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
});
afterEach(() => {
  setProviderOverride(null);
  process.env.CLINICAL_INTELLIGENCE_ENABLED = "true";
  resetEnvCache();
});
afterAll(() => prisma.$disconnect());

describe("Consent (separate purpose, separate permissions)", () => {
  it("nothing is analysed without the Clinical Intelligence consent; ordinary chat still works", async () => {
    const calls = fakeModel(standard);
    const p = await makePatient();
    await chat(p.patientId, SAID);
    expect(calls.chat).toHaveLength(1); // ordinary AI chat consent is NOT Clinical Intelligence consent
    expect(await analyze(p.patientId)).toEqual({ status: "NO_CONSENT" });
    expect(calls.ci).toHaveLength(0);
    expect(await insights(p.patientId)).toHaveLength(0);
  });

  it("never uses conversations from before consent", async () => {
    const calls = fakeModel(standard);
    const p = await makePatient();
    const convo = await chat(p.patientId, "OLD-PRIVATE: my secret from last month");
    await setConsent(p, p.patientId, "CLINICAL_INTELLIGENCE", true);
    expect(await analyze(p.patientId)).toEqual({ status: "NO_DATA" });
    await new Promise((r) => setTimeout(r, 5));
    await chat(p.patientId, SAID, convo);
    await analyze(p.patientId);
    const sent = JSON.stringify(calls.ci);
    expect(sent).toContain("constantly worried about my work");
    expect(sent).not.toContain("OLD-PRIVATE");
    expect(sent).not.toContain("How has your sleep"); // Sakinah's own replies are not patient-reported data
  });
});

describe("Extraction, grounding and storage", () => {
  it("stores only grounded, non-diagnostic findings with sources; encrypted and audited; no notifications", async () => {
    fakeModel(standard);
    const p = await makePatient();
    await prisma.patientProfile.update({ where: { id: p.patientId }, data: { ageBand: "25-34" } });
    await setConsent(p, p.patientId, "CLINICAL_INTELLIGENCE", true);
    await prisma.wellbeingAssessment.create({ data: { patientId: p.patientId, answers: [3, 3, 2, 2, 2], rawScore: 12, percentScore: 48 } });
    await chat(p.patientId, SAID);
    expect((await analyze(p.patientId)).status).toBe("UNCHANGED"); // already analysed in the background after the chat
    expect(await insights(p.patientId)).toHaveLength(1);
    const [row] = await insights(p.patientId);
    expect(row.contentEnc).not.toContain("worried"); // encrypted at rest
    const view = await getPatientInsights(p, p.patientId);
    const c = view.latest!.content;
    expect(view.latest!.patientStatus).toBe("DRAFT");
    expect(c.label).toBe("Preliminary AI-generated clinical impression — not a confirmed diagnosis. Requires professional assessment.");
    expect(c.sections.reportedSymptoms.map((i) => i.text)).toEqual(["Reports difficulty sleeping.", "Reports difficulty concentrating."]);
    expect(c.sections.durationAndFrequency[0].text).toMatch(/three weeks/);
    expect(c.sections.durationAndFrequency[0].source.messageId).toBeTruthy();
    expect(JSON.stringify(c)).not.toMatch(/panic attacks|generalized anxiety disorder|25-34/);
    expect(c.removed).toBe(2);
    expect(view.wellbeing.who5[0].percentScore).toBe(48);
    expect(await prisma.auditLog.count({ where: { action: "CLINICAL_INTELLIGENCE_ANALYSIS", subjectPatientId: p.patientId } })).toBe(1);
    expect(await prisma.contactNotification.count()).toBe(0);
    expect(await prisma.emergencyCase.count()).toBe(0);
    expect(await prisma.safetyEvent.count({ where: { patientId: p.patientId } })).toBe(0);
  });

  it("is idempotent for unchanged inputs and builds a longitudinal history from new information", async () => {
    let round = 0;
    const calls = fakeModel(() =>
      round++ === 0
        ? standard()
        : { ...standard(), presentingConcerns: [], reportedSymptoms: [{ text: "Reports sleeping a bit better.", category: "SLEEP", quote: "sleeping a bit better", messageRef: "M2" }], reportedChanges: [{ text: "Reports sleeping a bit better this week.", category: "SLEEP", quote: "sleeping a bit better", messageRef: "M2" }] },
    );
    const p = await makePatient();
    await setConsent(p, p.patientId, "CLINICAL_INTELLIGENCE", true);
    const convo = await chat(p.patientId, SAID); // event-driven: analysed after the chat
    expect(await insights(p.patientId)).toHaveLength(1);
    expect((await analyze(p.patientId)).status).toBe("UNCHANGED");
    expect((await analyze(p.patientId)).status).toBe("UNCHANGED");
    expect(calls.ci).toHaveLength(1); // unchanged inputs are never re-analysed
    await chat(p.patientId, "This week I'm sleeping a bit better with the routine.", convo); // chat trigger rate-limited (1 per 2 min)
    expect((await analyze(p.patientId)).status).toBe("CREATED");
    const view = await getPatientInsights(p, p.patientId);
    expect(view.history).toHaveLength(2);
    expect(view.latest!.changes.noLongerMentioned).toContain("WORRY");
    expect(view.latest!.content.sections.reportedChanges[0].text).toMatch(/sleeping a bit better/);
  });

  it("malformed model output never breaks anything and stores nothing", async () => {
    fakeModel(() => ({ nonsense: true, presentingConcerns: "x" }));
    const p = await makePatient();
    await setConsent(p, p.patientId, "CLINICAL_INTELLIGENCE", true);
    await chat(p.patientId, SAID); // the background analysis fails quietly; chat is unaffected
    expect((await analyze(p.patientId)).status).toBe("FAILED");
    expect(await insights(p.patientId)).toHaveLength(0);
  });
});

describe("Patient review → separate sharing consent → clinician review → care-plan loop", () => {
  it("runs the full loop with every permission enforced", async () => {
    const calls = fakeModel(standard);
    const p = await makePatient("Maya");
    const doc = await makeClinician("Dr Aisha");
    const other = await makeClinician("Dr Other");
    await setConsent(p, p.patientId, "CLINICAL_INTELLIGENCE", true);
    await chat(p.patientId, SAID);
    const draft = (await getPatientInsights(p, p.patientId)).latest!;

    // Shared summary WITHOUT the Clinical Insights category: the clinician sees nothing of it.
    await shareSummary(p.patientId, doc.clinicianId, ["WHO5_HISTORY"], null);
    expect(await getSharedInsightForClinician(doc, p.patientId)).toBeNull();

    // With the category but not yet approved by the patient: still nothing.
    await shareSummary(p.patientId, doc.clinicianId, ["WHO5_HISTORY", "CLINICAL_INSIGHTS"], null);
    expect((await getSharedInsightForClinician(doc, p.patientId))!.latest).toBeNull();

    // Patient removes an item, corrects, approves.
    const sleepItem = draft.content.sections.reportedSymptoms[0];
    await patientReview(p, p.patientId, draft.id, { removeItemIds: [sleepItem.id], note: "It's mostly falling asleep that's hard." });
    await patientReview(p, p.patientId, draft.id, { approve: true });
    const shared = (await getSharedInsightForClinician(doc, p.patientId))!;
    expect(shared.latest!.content.sections.reportedSymptoms.map((i) => i.text)).toEqual(["Reports difficulty concentrating."]);
    expect(shared.latest!.patientNote).toMatch(/falling asleep/);
    await expect(getSharedInsightForClinician(other, p.patientId)).rejects.toBeInstanceOf(AppError); // not assigned / not shared

    // Clinician: correction needs a note; approval is a review, not a diagnosis.
    await expect(clinicianReview(doc, draft.id, { decision: "CORRECTED" })).rejects.toMatchObject({ code: "VALIDATION" });
    await clinicianReview(doc, draft.id, { decision: "CORRECTED", note: "Sleep-onset difficulty specifically." });
    await clinicianReview(doc, draft.id, { decision: "REJECTED", note: "Superseded after assessment." });
    expect(await prisma.clinicianFinding.count({ where: { patientId: p.patientId } })).toBe(0); // no automatic diagnosis
    await expect(clinicianReview(other, draft.id, { decision: "APPROVED" })).rejects.toBeInstanceOf(AppError);

    // Care-plan feedback: Sakinah uses clinician goals ONLY with the patient's permission.
    await addClinicianGoal(doc, p.patientId, "Keep a regular evening wind-down routine");
    await expect(addClinicianGoal(other, p.patientId, "x goal")).rejects.toBeInstanceOf(AppError);
    expect(await careGoalsForSakinah(p.patientId)).toEqual([]);
    await setConsent(p, p.patientId, "CARE_PLAN_SUPPORT", true);
    expect(await careGoalsForSakinah(p.patientId)).toEqual(["Keep a regular evening wind-down routine (agreed with Dr Aisha)"]);
    calls.chat.length = 0;
    await chat(p.patientId, "Hi Sakinah");
    expect(calls.chat[0].system).toContain("Keep a regular evening wind-down routine");
    expect(calls.chat[0].system).not.toMatch(/Sleep-onset difficulty specifically/); // clinician notes stay private

    // Revocation: sharing revoked → clinician blocked; analysis revoked → no further processing.
    await prisma.consentRecord.updateMany({ where: { patientId: p.patientId, scope: "SHARE_SUMMARY_WITH_CLINICIAN" }, data: { revokedAt: new Date() } });
    await expect(getSharedInsightForClinician(doc, p.patientId)).rejects.toBeInstanceOf(AppError);
    await setConsent(p, p.patientId, "CLINICAL_INTELLIGENCE", false);
    await chat(p.patientId, "Another update about my week and my sleep.");
    expect(await analyze(p.patientId)).toEqual({ status: "NO_CONSENT" });
  });
});

describe("Safety Guardian and rollback flag", () => {
  it("a crisis message gets the deterministic crisis response; no AI call and no analysis", async () => {
    const calls = fakeModel(standard);
    const p = await makePatient();
    await setConsent(p, p.patientId, "CLINICAL_INTELLIGENCE", true);
    const convo = await startConversation(p.patientId);
    const events: { type: string; text?: string }[] = [];
    for await (const ev of sendMessage(p.patientId, convo.id, "I'm going to kill myself tonight", { aiAllowed: true })) events.push(ev as { type: string; text?: string });
    await new Promise((r) => setTimeout(r, 30));
    expect(events.find((e) => e.type === "done")!.text).toMatch(/998/);
    expect(calls.chat).toHaveLength(0);
    expect(calls.ci).toHaveLength(0);
    expect(await prisma.emergencyCase.count()).toBe(0);
  });

  it("CLINICAL_INTELLIGENCE_ENABLED=false disables analysis and care goals; chat is unaffected", async () => {
    const calls = fakeModel(standard);
    const p = await makePatient();
    await setConsent(p, p.patientId, "CLINICAL_INTELLIGENCE", true);
    await prisma.consentRecord.create({ data: { patientId: p.patientId, scope: "CARE_PLAN_SUPPORT", categories: [], policyVersion: POLICY_VERSION } });
    await prisma.wellbeingGoal.create({ data: { patientId: p.patientId, title: "Walk daily", source: "CLINICIAN" } });
    process.env.CLINICAL_INTELLIGENCE_ENABLED = "false";
    resetEnvCache();
    await chat(p.patientId, SAID);
    expect(calls.chat).toHaveLength(1);
    expect(calls.chat[0].system).not.toContain("Walk daily");
    expect(await analyze(p.patientId)).toEqual({ status: "DISABLED" });
    await expect(setConsent(p, p.patientId, "CLINICAL_INTELLIGENCE", true)).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect((await getPatientInsights(p, p.patientId)).enabled).toBe(false);
  });

  it("encrypted message data used for analysis stays readable (encryption intact)", async () => {
    fakeModel(standard);
    const p = await makePatient();
    await setConsent(p, p.patientId, "CLINICAL_INTELLIGENCE", true);
    const convo = await startConversation(p.patientId);
    await prisma.chatMessage.create({ data: { conversationId: convo.id, role: "USER", contentEnc: encrypt(SAID) } });
    expect((await analyze(p.patientId)).status).toBe("CREATED");
  });
});

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Actor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { encrypt } from "@/lib/crypto";
import { resetRateLimits } from "@/lib/rate-limit";
import { setProviderOverride } from "@/features/ai/provider-factory";
import type { ChatProvider, GenerateInput } from "@/features/ai/types";
import { makeClinician, makePatient, resetDb } from "../support/fixtures";

/**
 * AI-assisted clinical support: source authorization, AI-vs-clinician separation, review
 * decisions, consent revocation and patient-controlled referrals. Synthetic data only.
 */
const current: { actor: Actor | null } = { actor: null };
vi.mock("@/lib/auth/current-user", () => ({ getCurrentActor: async () => current.actor }));

const summaries = await import("@/app/api/summaries/route");
const preview = await import("@/app/api/summaries/preview/route");
const review = await import("@/app/api/summaries/[id]/review/route");
const revokeSummary = await import("@/app/api/summaries/[id]/revoke/route");
const findings = await import("@/app/api/clinician/patients/[id]/findings/route");
const referrals = await import("@/app/api/referrals/route");

const ctx = { params: Promise.resolve({}) };
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });
function req(url: string, json?: unknown) {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method: json === undefined ? "GET" : "POST",
    body: json === undefined ? undefined : JSON.stringify(json),
    headers: { host: "localhost:3000", "content-type": "application/json" },
  });
}
async function call(handler: (r: NextRequest, c: { params: Promise<Record<string, string>> }) => Promise<Response>, url: string, json?: unknown, c = ctx) {
  const res = await handler(req(url, json), c);
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const CONCERNS = { areas: ["STRESS", "SLEEP"], duration: "1_TO_3_MONTHS", frequency: "MOST_DAYS", dailyLifeImpact: "A_LOT", helpWanted: "ASSESSMENT" };

/** Fake model: records exactly what the AI draft step receives. */
const GROUNDED_DRAFT = [
  "Patient-reported concerns:",
  "- Patient reports stress and poor sleep, nearly every day for 1–3 months [Patient-reported concerns]",
  "Questions the clinician may wish to explore:",
  "- How the patient describes the effect on daily life [Patient-reported concerns]",
].join("\n");

function fakeDraftModel(draft = GROUNDED_DRAFT) {
  const seen: GenerateInput[] = [];
  const p: ChatProvider = {
    id: "openai",
    label: "test",
    model: "test",
    isGenerative: true,
    async *stream() {
      yield "";
    },
    async complete(input) {
      seen.push(input);
      return draft;
    },
  };
  setProviderOverride(p);
  return seen;
}

async function setup() {
  const patient = await makePatient("Noor");
  const aisha = await makeClinician("Dr Aisha");
  const james = await makeClinician("Dr James");
  return { patient, aisha, james };
}

async function share(patient: Actor, clinicianId: string, categories: string[], extra: Record<string, unknown> = {}) {
  current.actor = patient;
  return call(summaries.POST, "/api/summaries", { clinicianId, categories, confirm: true, ...extra });
}

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  current.actor = null;
});
afterEach(() => setProviderOverride(null));
afterAll(() => prisma.$disconnect());

describe("Clinical summary: patient-controlled sources", () => {
  it("includes patient-reported concerns only when the patient chose to share them", async () => {
    const { patient, aisha } = await setup();
    current.actor = patient;
    const withConcerns = await call(preview.POST, "/api/summaries/preview", { clinicianId: aisha.clinicianId, categories: ["REPORTED_CONCERNS"], reportedConcerns: CONCERNS });
    expect(withConcerns.status).toBe(200);
    expect(withConcerns.body.preview.reportedConcerns).toEqual({
      areas: ["Stress or pressure", "Sleep"],
      duration: "1–3 months",
      frequency: "Nearly every day",
      dailyLifeImpact: "A lot",
      helpWanted: "A professional assessment",
    });
    // Supplied but not authorised (category not ticked): never included.
    const notChosen = await call(preview.POST, "/api/summaries/preview", { clinicianId: aisha.clinicianId, categories: ["GOALS"], reportedConcerns: CONCERNS });
    expect(notChosen.body.preview.reportedConcerns).toBeUndefined();
    // Ticked but not filled in: rejected, nothing shared.
    expect((await call(preview.POST, "/api/summaries/preview", { clinicianId: aisha.clinicianId, categories: ["REPORTED_CONCERNS"] })).status).toBe(400);
  });

  it("the AI draft only ever receives the approved structured snapshot, never conversations", async () => {
    const seen = fakeDraftModel();
    const { patient, aisha } = await setup();
    const convo = await prisma.conversation.create({ data: { patientId: patient.patientId } });
    await prisma.chatMessage.create({ data: { conversationId: convo.id, role: "USER", contentEnc: encrypt("SECRET-CHAT-TEXT about my family") } });
    const r = await share(patient, aisha.clinicianId, ["REPORTED_CONCERNS", "REFERRAL_HISTORY"], { reportedConcerns: CONCERNS });
    expect(r.status).toBe(200);
    expect(seen).toHaveLength(1);
    const sent = JSON.stringify(seen[0]);
    expect(sent).not.toContain("SECRET-CHAT-TEXT");
    expect(sent).toContain("Stress or pressure");
    expect(seen[0].system).toMatch(/Not a confirmed diagnosis/);
  });
});

describe("AI draft grounding before clinicians see it (regression)", () => {
  it("stores only grounded statements: demographics as a concern and unsupported findings are removed", async () => {
    fakeDraftModel(
      [
        "Patient-reported concerns:",
        "- Patient reports stress and poor sleep nearly every day for 1–3 months [Patient-reported concerns]",
        "- Age band 35–44 [Patient-reported concerns]",
        "Preliminary observations (AI, unverified):",
        "- Consistent with generalized anxiety disorder [Patient-reported concerns]",
        "- History of panic attacks since childhood",
        "Questions the clinician may wish to explore:",
        "- Which daily activities are most affected [Patient-reported concerns]",
      ].join("\n"),
    );
    const { patient, aisha } = await setup();
    await prisma.patientProfile.update({ where: { id: patient.patientId }, data: { ageBand: "35-44" } });
    const r = await share(patient, aisha.clinicianId, ["REPORTED_CONCERNS"], { reportedConcerns: CONCERNS });
    current.actor = aisha;
    const detail = await prisma.clinicalSummary.findUniqueOrThrow({ where: { id: r.body.summary.id } });
    const { decrypt } = await import("@/lib/crypto");
    const stored = decrypt(detail.aiDraftEnc!);
    expect(stored).toContain("Patient reports stress and poor sleep");
    expect(stored).not.toMatch(/35–44|anxiety disorder|childhood/);
    expect(stored).toMatch(/3 AI statements were removed by automatic grounding checks/);
    expect(detail.aiDraftStatus).toBe("UNVERIFIED");
    expect(await prisma.systemEvent.count({ where: { kind: "AI_DRAFT_FILTERED", code: "3" } })).toBe(1);
  });

  it("an entirely ungrounded draft is not stored at all", async () => {
    fakeDraftModel("The patient clearly has major depression and should start medication.");
    const { patient, aisha } = await setup();
    const r = await share(patient, aisha.clinicianId, ["REPORTED_CONCERNS"], { reportedConcerns: CONCERNS });
    expect((await prisma.clinicalSummary.findUniqueOrThrow({ where: { id: r.body.summary.id } })).aiDraftEnc).toBeNull();
  });
});

describe("Clinician review of the AI summary and confirmed findings", () => {
  async function sharedSummary() {
    fakeDraftModel();
    const s = await setup();
    const r = await share(s.patient, s.aisha.clinicianId, ["REPORTED_CONCERNS"], { reportedConcerns: CONCERNS });
    return { ...s, summaryId: r.body.summary.id as string };
  }

  it("the assigned clinician can approve, correct (original kept) or reject, each audited", async () => {
    const { aisha, summaryId } = await sharedSummary();
    current.actor = aisha;
    expect((await call(review.POST, "/x", { decision: "CORRECTED" }, idCtx(summaryId))).status).toBe(400); // correction needs text
    expect((await call(review.POST, "/x", { decision: "CORRECTED", correctedText: "Corrected synthetic summary.", note: "Fixed duration." }, idCtx(summaryId))).body.summary.aiDraftStatus).toBe("CORRECTED");
    const row = await prisma.clinicalSummary.findUniqueOrThrow({ where: { id: summaryId } });
    expect(row.aiDraftEnc).toBeTruthy(); // original AI draft kept
    expect(row.correctedDraftEnc?.startsWith("v1:")).toBe(true); // encrypted
    expect((await call(review.POST, "/x", { decision: "APPROVED" }, idCtx(summaryId))).body.summary.aiDraftStatus).toBe("APPROVED");
    expect((await prisma.clinicalSummary.findUniqueOrThrow({ where: { id: summaryId } })).correctedDraftEnc).toBe(row.correctedDraftEnc); // not erased
    expect((await call(review.POST, "/x", { decision: "REJECTED" }, idCtx(summaryId))).body.summary.aiDraftStatus).toBe("REJECTED");
    expect((await call(review.POST, "/x", {}, idCtx(summaryId))).body.summary.aiDraftStatus).toBe("REVIEWED"); // legacy default
    const actions = (await prisma.auditLog.findMany({ where: { resourceId: summaryId } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["REVIEW_AI_DRAFT_CORRECTED", "REVIEW_AI_DRAFT_APPROVED", "REVIEW_AI_DRAFT_REJECTED"]));
  });

  it("another clinician cannot review it, and revoked consent blocks the assigned clinician too", async () => {
    const { patient, aisha, james, summaryId } = await sharedSummary();
    current.actor = james;
    expect((await call(review.POST, "/x", { decision: "APPROVED" }, idCtx(summaryId))).status).toBe(403);
    current.actor = patient;
    expect((await call(revokeSummary.POST, "/x", {}, idCtx(summaryId))).status).toBe(200);
    current.actor = aisha;
    expect([403, 404]).toContain((await call(review.POST, "/x", { decision: "APPROVED" }, idCtx(summaryId))).status);
    expect((await call(findings.GET, "/x", undefined, idCtx(patient.patientId))).status).toBe(403);
  });

  it("confirmed findings are clinician-authored, separate from the AI draft, audited and access-restricted", async () => {
    const { patient, aisha, james, summaryId } = await sharedSummary();
    current.actor = aisha;
    const created = await call(findings.POST, "/x", { kind: "DIAGNOSIS", content: "Synthetic clinician-confirmed finding." }, idCtx(patient.patientId));
    expect(created.status).toBe(200);
    const list = await call(findings.GET, "/x", undefined, idCtx(patient.patientId));
    expect(list.body.findings).toEqual([expect.objectContaining({ kind: "DIAGNOSIS", content: "Synthetic clinician-confirmed finding.", author: "Dr Aisha" })]);
    expect((await prisma.clinicianFinding.findFirstOrThrow()).contentEnc.startsWith("v1:")).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: "FINDING_CREATED_DIAGNOSIS", subjectPatientId: patient.patientId } })).toBe(1);
    // The AI draft is untouched by clinician findings.
    expect((await prisma.clinicalSummary.findUniqueOrThrow({ where: { id: summaryId } })).aiDraftStatus).toBe("UNVERIFIED");
    // Other clinicians and patients cannot read or write findings.
    current.actor = james;
    expect((await call(findings.GET, "/x", undefined, idCtx(patient.patientId))).status).toBe(403);
    expect((await call(findings.POST, "/x", { kind: "CARE_PLAN", content: "Nope" }, idCtx(patient.patientId))).status).toBe(403);
    current.actor = patient;
    expect((await call(findings.GET, "/x", undefined, idCtx(patient.patientId))).status).toBe(403);
  });
});

describe("Patient-controlled referral requests", () => {
  it("records the kind of help the patient chose; only patients can request; clearly simulated", async () => {
    const { patient, aisha } = await setup();
    current.actor = patient;
    const r = await call(referrals.POST, "/api/referrals", { clinicianId: aisha.clinicianId, urgency: "ROUTINE", careType: "PSYCHIATRIST" });
    expect(r.status).toBe(200);
    expect(r.body.referral).toMatchObject({ status: "REQUESTED", isSimulated: true });
    expect((await prisma.careReferral.findUniqueOrThrow({ where: { id: r.body.referral.id } })).careType).toBe("PSYCHIATRIST");
    current.actor = aisha;
    expect((await call(referrals.POST, "/api/referrals", { clinicianId: aisha.clinicianId, urgency: "ROUTINE" })).status).toBe(403);
  });

  it("referral history is shared only when the patient includes it", async () => {
    fakeDraftModel();
    const { patient, aisha } = await setup();
    current.actor = patient;
    await call(referrals.POST, "/api/referrals", { clinicianId: aisha.clinicianId, urgency: "SOON", careType: "PSYCHOLOGIST" });
    const without = await call(preview.POST, "/api/summaries/preview", { clinicianId: aisha.clinicianId, categories: ["GOALS"] });
    expect(without.body.preview.referralHistory).toBeUndefined();
    const withIt = await call(preview.POST, "/api/summaries/preview", { clinicianId: aisha.clinicianId, categories: ["REFERRAL_HISTORY"] });
    expect(withIt.body.preview.referralHistory).toEqual([expect.objectContaining({ status: "REQUESTED", careType: "PSYCHOLOGIST", with: "Dr Aisha" })]);
  });
});

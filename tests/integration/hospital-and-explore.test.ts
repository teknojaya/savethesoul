import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Actor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import { hashPassword } from "@/lib/auth/password";
import { resetEnvCache } from "@/lib/env";
import { resetRateLimits } from "@/lib/rate-limit";
import { POLICY_VERSION } from "@/features/consent/policy";
import { setProviderOverride } from "@/features/ai/provider-factory";
import type { ChatProvider } from "@/features/ai/types";
import { DEMO_HOSPITAL_ORG } from "@/server/services/emergency.service";
import { prepareDemo, DEMO_RECORD_LABEL } from "@/server/demo/prepare-demo";
import { makeClinician, makePatient, resetDb } from "../support/fixtures";

/** Hospital emergency portal (simulated), demo login, and "Explore My Mental Wellbeing". Synthetic data only. */
const current: { actor: Actor | null } = { actor: null };
vi.mock("@/lib/auth/current-user", () => ({ getCurrentActor: async () => current.actor }));

const cases = await import("@/app/api/hospital/cases/route");
const caseDetail = await import("@/app/api/hospital/cases/[id]/route");
const transition = await import("@/app/api/hospital/cases/[id]/transition/route");
const family = await import("@/app/api/hospital/cases/[id]/family-notification/route");
const safetyEvents = await import("@/app/api/safety/events/route");
const alert = await import("@/app/api/safety/events/[id]/alert/route");
const demoLogin = await import("@/app/api/auth/demo-login/route");
const explore = await import("@/app/api/wellbeing/explore/route");

const ctx = { params: Promise.resolve({}) };
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });
function req(url: string, json?: unknown) {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method: json === undefined ? "GET" : "POST",
    body: json === undefined ? undefined : JSON.stringify(json),
    headers: { host: "localhost:3000", "content-type": "application/json" },
  });
}
async function call(h: (r: NextRequest, c: { params: Promise<Record<string, string>> }) => Promise<Response>, json?: unknown, c = ctx) {
  const res = await h(req("/x", json), c);
  return { status: res.status, body: await res.json().catch(() => ({})), headers: res.headers };
}

async function makeCoordinator(org = DEMO_HOSPITAL_ORG, email = `coord-${Math.random().toString(36).slice(2)}@test.local`): Promise<Actor> {
  const u = await prisma.user.create({
    data: { email, passwordHash: "x", displayName: "Coordinator", role: "HOSPITAL_COORDINATOR", isDemo: true, hospitalProfile: { create: { organization: org, title: "Desk" } } },
    include: { hospitalProfile: true },
  });
  return { userId: u.id, role: "HOSPITAL_COORDINATOR", displayName: u.displayName, isDemo: true, patientId: null, clinicianId: null, hospitalId: u.hospitalProfile!.id };
}

async function makeCase(org: string, patientId: string | null = null, status: "REVIEW_REQUESTED" | "ACKNOWLEDGED" = "REVIEW_REQUESTED") {
  return prisma.emergencyCase.create({
    data: { caseRef: `T-${Math.random().toString(36).slice(2, 8)}`, hospitalOrg: org, status, patientId, concernType: "Test concern", contextEnc: encrypt("Synthetic context"), authorizationStatus: "Synthetic" },
  });
}

async function authorisedContact(patientId: string, opts: { safety: boolean; consent: boolean }) {
  const c = await prisma.trustedContact.create({
    data: { patientId, name: "Mariam (synthetic)", relationship: "Parent", canReceiveUpdates: true, canReceiveSafetyAlerts: opts.safety, sharedCategories: ["SAFETY_PLAN_SUPPORT"] },
  });
  if (opts.consent) {
    await prisma.consentRecord.create({ data: { patientId, scope: "TRUSTED_CONTACT_SHARING", granteeType: "TRUSTED_CONTACT", granteeId: c.id, categories: ["SAFETY_PLAN_SUPPORT"], policyVersion: POLICY_VERSION } });
  }
  return c;
}

beforeEach(async () => {
  await resetDb();
  await prisma.emergencyCase.deleteMany();
  resetRateLimits();
  current.actor = null;
});
afterEach(() => {
  setProviderOverride(null);
  process.env.DEMO_MODE = "true";
  resetEnvCache();
});
afterAll(() => prisma.$disconnect());

describe("Hospital portal: role and organisation scoping", () => {
  it("only hospital coordinators can use it; patients and clinicians get 403, anonymous 401", async () => {
    expect((await call(cases.GET)).status).toBe(401);
    current.actor = await makePatient();
    expect((await call(cases.GET)).status).toBe(403);
    current.actor = await makeClinician();
    expect((await call(cases.GET)).status).toBe(403);
    current.actor = await makeCoordinator();
    expect((await call(cases.GET)).status).toBe(200);
  });

  it("a coordinator sees only cases routed to their own hospital; other cases are 404 and audited", async () => {
    const mine = await makeCase(DEMO_HOSPITAL_ORG);
    const other = await makeCase("Another synthetic hospital");
    const coord = await makeCoordinator();
    current.actor = coord;
    const list = await call(cases.GET);
    expect(list.body.cases.map((c: { id: string }) => c.id)).toEqual([mine.id]);
    expect((await call(caseDetail.GET, undefined, idCtx(other.id))).status).toBe(404);
    expect((await call(transition.POST, { to: "ACKNOWLEDGED" }, idCtx(other.id))).status).toBe(404);
    expect(await prisma.auditLog.count({ where: { resourceId: other.id, outcome: "DENIED" } })).toBe(2);
    const detail = await call(caseDetail.GET, undefined, idCtx(mine.id));
    expect(detail.body.case).toMatchObject({ isSimulated: true, context: "Synthetic context" });
    expect(JSON.stringify(detail.body)).not.toMatch(/messages|conversation/i);
  });
});

describe("Simulated response workflow", () => {
  it("validates transitions, records an audited timeline, and assigns the acknowledging coordinator", async () => {
    const c = await makeCase(DEMO_HOSPITAL_ORG);
    current.actor = await makeCoordinator();
    expect((await call(transition.POST, { to: "RESOLVED" }, idCtx(c.id))).status).toBe(409); // cannot skip review
    for (const to of ["ACKNOWLEDGED", "CONTACT_ATTEMPTED", "ASSISTANCE_ARRANGED", "RESOLVED"]) {
      const r = await call(transition.POST, { to, note: `Synthetic note ${to}` }, idCtx(c.id));
      expect(r.status).toBe(200);
      expect(r.body.case).toMatchObject({ status: to, simulated: true });
    }
    expect((await call(transition.POST, { to: "ACKNOWLEDGED" }, idCtx(c.id))).status).toBe(409); // closed
    const row = await prisma.emergencyCase.findUniqueOrThrow({ where: { id: c.id }, include: { events: true } });
    expect(row.assignedResponder).toBe("Coordinator");
    expect(row.events.every((e) => e.simulated)).toBe(true);
    expect(decrypt(row.events.find((e) => e.toStatus === "ASSISTANCE_ARRANGED")!.noteEnc!)).toBe("Synthetic note ASSISTANCE_ARRANGED");
    expect(await prisma.auditLog.count({ where: { resourceId: c.id, action: { startsWith: "EMERGENCY_CASE_" } } })).toBe(4); // one audit entry per completed transition
  });
});

describe("Trusted-contact coordination (simulated) respects the patient's permissions", () => {
  it("allowed only for a contact the patient authorised for safety messages, after acknowledgement", async () => {
    const p = await makePatient("Sara");
    const ok = await authorisedContact(p.patientId, { safety: true, consent: true });
    const noSafety = await authorisedContact(p.patientId, { safety: false, consent: true });
    const c = await makeCase(DEMO_HOSPITAL_ORG, p.patientId);
    current.actor = await makeCoordinator();

    expect((await call(family.POST, { contactId: ok.id }, idCtx(c.id))).status).toBe(409); // acknowledge first
    await call(transition.POST, { to: "ACKNOWLEDGED" }, idCtx(c.id));
    const sent = await call(family.POST, { contactId: ok.id }, idCtx(c.id));
    expect(sent.body).toMatchObject({ simulated: true });
    expect(sent.body.preview).not.toMatch(/conversation|message history/i);
    expect(await prisma.contactNotification.count({ where: { patientId: p.patientId, status: "SIMULATED_SENT", kind: "SAFETY_ALERT" } })).toBe(1); // visible to the patient
    expect((await call(family.POST, { contactId: noSafety.id }, idCtx(c.id))).status).toBe(403);

    await prisma.consentRecord.updateMany({ where: { patientId: p.patientId, granteeId: ok.id }, data: { revokedAt: new Date() } });
    expect((await call(family.POST, { contactId: ok.id }, idCtx(c.id))).status).toBe(403); // revoked
  });
});

describe("Demo-only case creation from a patient-initiated alert (never automatic for real accounts)", () => {
  async function alertAs(patient: Actor) {
    current.actor = patient;
    const se = await call(safetyEvents.POST, { level: "IMMEDIATE_DANGER" });
    return call(alert.POST, {}, idCtx(se.body.safetyEventId));
  }
  it("opens a simulated hospital case for a synthetic demo patient only", async () => {
    const demo = await makePatient("Demo");
    await prisma.user.update({ where: { id: demo.userId }, data: { isDemo: true } });
    const r = await alertAs({ ...demo, isDemo: true });
    expect(r.body.hospitalCaseRef).toMatch(/^SIM-ER-/);
    expect(await prisma.emergencyCase.count({ where: { patientId: demo.patientId, status: "REVIEW_REQUESTED", isSimulated: true } })).toBe(1);

    const real = await makePatient("Real");
    const r2 = await alertAs(real);
    expect(r2.body.hospitalCaseRef).toBeUndefined();
    expect(await prisma.emergencyCase.count({ where: { patientId: real.patientId } })).toBe(0);
  });
  it("never outside demo mode", async () => {
    process.env.DEMO_MODE = "false";
    resetEnvCache();
    const demo = await makePatient("Demo");
    await prisma.user.update({ where: { id: demo.userId }, data: { isDemo: true } });
    await alertAs({ ...demo, isDemo: true });
    expect(await prisma.emergencyCase.count()).toBe(0);
  });
});

describe("Server-side one-click demo login", () => {
  it("signs into a synthetic demo account only, never a real one, and only in demo mode", async () => {
    await prisma.user.create({ data: { email: "coordinator@demo.savethesoul.app", passwordHash: await hashPassword("random-never-shown"), displayName: "Coord", role: "HOSPITAL_COORDINATOR", isDemo: true, hospitalProfile: { create: { organization: DEMO_HOSPITAL_ORG, title: "Desk" } } } });
    const ok = await call(demoLogin.POST, { account: "coordinator" });
    expect(ok.status).toBe(200);
    expect(ok.body.redirectTo).toBe("/hospital");
    expect(ok.headers.get("set-cookie")).toMatch(/sts_session=/);
    expect((await call(demoLogin.POST, { account: "someone-else" })).status).toBe(400);
    // A non-demo account with a demo-domain email is never reachable this way.
    await prisma.user.create({ data: { email: "omar@demo.savethesoul.app", passwordHash: "x", displayName: "Not demo", role: "PATIENT", isDemo: false } });
    expect((await call(demoLogin.POST, { account: "omar" })).status).toBe(404);
    process.env.DEMO_MODE = "false";
    resetEnvCache();
    expect((await call(demoLogin.POST, { account: "coordinator" })).status).toBe(404);
  });
});

describe("Explore My Mental Wellbeing (AI-assisted, preliminary, not stored)", () => {
  const answers = { areas: ["WORRY", "SLEEP"], duration: "OVER_3_MONTHS", frequency: "MOST_DAYS", dailyLifeImpact: "A_LOT", sleep: "POOR", stress: "HIGH", consent: true };
  function fake(text: string) {
    const calls: unknown[] = [];
    const p: ChatProvider = { id: "openai", label: "t", model: "t", isGenerative: true, async *stream() {}, complete: async (i) => (calls.push(i), text) };
    setProviderOverride(p);
    return calls;
  }

  it("requires explicit permission and AI-processing consent", async () => {
    const p = await makePatient();
    current.actor = p;
    expect((await call(explore.POST, { ...answers, consent: false })).status).toBe(400);
    await prisma.consentRecord.updateMany({ where: { patientId: p.patientId, scope: "AI_PROCESSING" }, data: { revokedAt: new Date() } });
    expect((await call(explore.POST, answers)).status).toBe(403);
  });

  it("a crisis in the person's own words gets safety guidance without calling the AI", async () => {
    const calls = fake("- unused [Your answers]");
    current.actor = await makePatient();
    const r = await call(explore.POST, { ...answers, ownWords: "I'm going to kill myself tonight" });
    expect(r.body).toMatchObject({ kind: "safety", level: "IMMEDIATE_DANGER" });
    expect(r.body.text).toMatch(/998/);
    expect(calls).toHaveLength(0);
  });

  it("returns a labelled, grounded preliminary explanation and stores nothing", async () => {
    fake(
      [
        "What you told me:",
        "- You've had worry and poor sleep for more than 3 months [Your answers]",
        "- Your answers suggest generalized anxiety disorder [Your answers]",
        "Possible areas a professional might explore:",
        "- Ongoing worry and sleep difficulties [Your answers]",
        "- Your WHO-5 trend [WHO-5]",
        "Questions you might bring to a clinician:",
        "- What might keep the worry going at night? [Your answers]",
      ].join("\n"),
    );
    const p = await makePatient();
    current.actor = p;
    const before = await prisma.chatMessage.count();
    const r = await call(explore.POST, answers);
    expect(r.body.kind).toBe("summary");
    expect(r.body.label).toBe("Preliminary AI-generated clinical impression — not a confirmed diagnosis. Requires professional assessment.");
    expect(r.body.ai).toContain("worry and poor sleep");
    expect(r.body.ai).not.toMatch(/anxiety disorder/); // diagnostic statement removed
    expect(r.body.ai).not.toMatch(/WHO-5 trend/); // no WHO-5 results exist: unsupported source removed
    expect(r.body.unclear.join(" ")).toMatch(/haven't completed a WHO-5/);
    expect(await prisma.chatMessage.count()).toBe(before);
    expect(await prisma.clinicalSummary.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "EXPLORE_WELLBEING_RUN", subjectPatientId: p.patientId } })).toBe(1);
  });

  it("without a real model, shows a plain summary and never pretends it is AI", async () => {
    current.actor = await makePatient();
    const r = await call(explore.POST, answers);
    expect(r.body).toMatchObject({ kind: "summary", ai: null });
  });
});

describe("Demo preparation (targeted, idempotent, clinician-authored fictional records)", () => {
  it("creates labelled synthetic cases once and never duplicates or overwrites", async () => {
    const aisha = await prisma.user.create({
      data: { email: "dr.aisha@demo.savethesoul.app", passwordHash: "x", displayName: "Dr. Aisha Al Mansoori", role: "CLINICIAN", isDemo: true, clinicianProfile: { create: { title: "Consultant Psychiatrist", specialty: "Psychiatry", organization: "Synthetic", licenseNumber: "SYN-1", isSynthetic: true } } },
      include: { clinicianProfile: true },
    });
    const first = await prepareDemo();
    expect(first.created.length).toBeGreaterThanOrEqual(12);
    const second = await prepareDemo();
    expect(second.created).toEqual([]);

    const findings = await prisma.clinicianFinding.findMany();
    expect(findings).toHaveLength(4); // diagnosis + care plan for two cases
    expect(findings.every((f) => f.authorUserId === aisha.id && f.clinicianId === aisha.clinicianProfile!.id)).toBe(true);
    const texts = findings.map((f) => decrypt(f.contentEnc));
    expect(texts.every((t) => t.startsWith(DEMO_RECORD_LABEL))).toBe(true);
    expect(texts.join(" ")).toMatch(/Generalized Anxiety Disorder/);
    expect(texts.join(" ")).toMatch(/Depressive episode, moderate/);
    expect(texts.join(" ")).toMatch(/no prescription is recorded/);
    expect(await prisma.emergencyCase.count({ where: { hospitalOrg: DEMO_HOSPITAL_ORG, isSimulated: true } })).toBe(6);
    const ai = await prisma.emergencyCase.findUniqueOrThrow({ where: { caseRef: "SIM-ER-1006" }, include: { events: true, patient: { include: { user: true } } } });
    expect(ai.status).toBe("REVIEW_REQUESTED");
    expect(ai.patient!.user.isDemo).toBe(true);
    expect(ai.events.some((e) => e.actorRole === "SAKINAH_AI" && e.kind === "AI_RISK_SIGNAL")).toBe(true);
    expect(decrypt(ai.contextEnc)).toMatch(/indirect suicide warning signs/);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: "coordinator@demo.savethesoul.app" } })).isDemo).toBe(true);
  });
});

/**
 * Synthetic demo data for SaveTheSoul. NO real patients, clinicians or records.
 *
 * Wipes and recreates all data. Refuses to run in production unless
 * SEED_ALLOW_RESET=true is set explicitly (e.g. for a dedicated demo deployment).
 */
import "dotenv/config";
import { prisma } from "../src/lib/db/prisma";
import { encrypt, encryptJson } from "../src/lib/crypto";
import { hashPassword } from "../src/lib/auth/password";
import { SUPPORT_RESOURCES } from "../src/features/safety/resources";
import { POLICY_VERSION } from "../src/features/consent/policy";
import { scoreWho5 } from "../src/features/assessments/who5";
import { DEMO_PASSWORD } from "../src/features/demo/accounts";

const DAY = 86_400_000;
const daysAgo = (d: number, hour = 10) => {
  const t = new Date(Date.now() - d * DAY);
  t.setHours(hour, 0, 0, 0);
  return t;
};

/** Builds a plausible WHO-5 answer set that sums to the target raw score. */
function answersFor(raw: number): number[] {
  const a = [0, 0, 0, 0, 0];
  for (let i = 0; i < raw; i++) a[i % 5] = Math.min(5, a[i % 5] + 1);
  return a;
}

async function wipe() {
  // Order matters only where FKs are not cascading.
  await prisma.auditLog.deleteMany();
  await prisma.systemEvent.deleteMany();
  await prisma.referralEvent.deleteMany();
  await prisma.followUp.deleteMany();
  await prisma.careReferral.deleteMany();
  await prisma.supportResource.deleteMany();
  await prisma.user.deleteMany(); // cascades to profiles and patient data
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.SEED_ALLOW_RESET !== "true") {
    throw new Error("Refusing to reset a production database. Set SEED_ALLOW_RESET=true for a dedicated demo deployment.");
  }
  await wipe();
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  // ── Support resources ─────────────────────────────────────
  for (const r of SUPPORT_RESOURCES) {
    await prisma.supportResource.create({
      data: {
        slug: r.slug,
        name: r.name,
        category: r.category,
        description: r.description,
        phone: r.phone,
        website: r.website,
        hours: r.hours,
        languages: r.languages,
        eligibility: r.eligibility,
        nextSteps: r.nextSteps,
        verificationStatus: r.verificationStatus,
        verificationNote: r.verificationNote,
        verifiedAt: r.verifiedAt ? new Date(r.verifiedAt) : null,
        sourceUrl: r.sourceUrl,
        sortOrder: r.sortOrder,
      },
    });
  }

  // ── Clinicians (synthetic) ────────────────────────────────
  const aisha = await prisma.user.create({
    data: {
      email: "dr.aisha@demo.savethesoul.app",
      passwordHash,
      displayName: "Dr. Aisha Al Mansoori",
      role: "CLINICIAN",
      isDemo: true,
      clinicianProfile: {
        create: {
          title: "Consultant Psychiatrist",
          specialty: "Adult psychiatry",
          organization: "Synthetic Demo Clinic, Abu Dhabi",
          licenseNumber: "DEMO-PSY-0001",
        },
      },
    },
    include: { clinicianProfile: true },
  });
  const james = await prisma.user.create({
    data: {
      email: "dr.james@demo.savethesoul.app",
      passwordHash,
      displayName: "Dr. James Okafor",
      role: "CLINICIAN",
      isDemo: true,
      clinicianProfile: {
        create: {
          title: "Clinical Psychologist",
          specialty: "Anxiety and stress",
          organization: "Synthetic Demo Clinic, Al Ain",
          licenseNumber: "DEMO-PSY-0002",
        },
      },
    },
    include: { clinicianProfile: true },
  });
  const aishaId = aisha.clinicianProfile!.id;
  const jamesId = james.clinicianProfile!.id;

  async function createPatient(opts: {
    email: string;
    name: string;
    ageBand?: string;
    memoryEnabled?: boolean;
    analytics?: boolean;
    loginable?: boolean;
    createdDaysAgo?: number;
  }) {
    const u = await prisma.user.create({
      data: {
        email: opts.email,
        passwordHash: opts.loginable === false ? await hashPassword(crypto.randomUUID()) : passwordHash,
        displayName: opts.name,
        role: "PATIENT",
        isDemo: true,
        createdAt: daysAgo(opts.createdDaysAgo ?? 90),
        patientProfile: {
          create: {
            preferredName: opts.name,
            ageBand: opts.ageBand ?? null,
            onboardingCompleted: true,
            memoryEnabled: !!opts.memoryEnabled,
          },
        },
      },
      include: { patientProfile: true },
    });
    const pid = u.patientProfile!.id;
    const scopes: ("AI_PROCESSING" | "WELLBEING_MEMORY" | "AGGREGATE_ANALYTICS")[] = ["AI_PROCESSING"];
    if (opts.memoryEnabled) scopes.push("WELLBEING_MEMORY");
    if (opts.analytics !== false) scopes.push("AGGREGATE_ANALYTICS");
    for (const scope of scopes) {
      await prisma.consentRecord.create({
        data: { patientId: pid, scope, categories: [], policyVersion: POLICY_VERSION, grantedAt: daysAgo(opts.createdDaysAgo ?? 90) },
      });
    }
    return pid;
  }

  async function who5(pid: string, percent: number, d: number) {
    const r = scoreWho5(answersFor(Math.round(percent / 4)));
    if (!r.ok) throw new Error("bad seed answers");
    await prisma.wellbeingAssessment.create({
      data: { patientId: pid, answers: r.answers, rawScore: r.rawScore, percentScore: r.percentScore, completedAt: daysAgo(d) },
    });
  }

  async function checkIns(pid: string, days: number, fn: (i: number) => { mood: number; stress: number; sleep: number; func: number }) {
    for (let i = days; i >= 1; i--) {
      if (i % 3 === 2) continue; // realistic gaps
      const v = fn(i);
      await prisma.wellbeingCheckIn.create({
        data: { patientId: pid, mood: v.mood, stress: v.stress, sleepQuality: v.sleep, functioning: v.func, createdAt: daysAgo(i, 21) },
      });
    }
  }

  const clamp = (n: number) => Math.max(1, Math.min(5, Math.round(n)));

  // ── Scenario 1/3/4: Omar — everyday support, no care team yet ──
  const omar = await createPatient({ email: "omar@demo.savethesoul.app", name: "Omar", ageBand: "25-34", memoryEnabled: true, createdDaysAgo: 20 });
  await who5(omar, 68, 14);
  await checkIns(omar, 14, (i) => ({ mood: clamp(3.5 + (i % 2) * 0.5), stress: clamp(3 + (i % 4 === 0 ? 1 : 0)), sleep: 3, func: 4 }));
  await prisma.wellbeingMemory.createMany({
    data: [
      { patientId: omar, contentEnc: encrypt("I work in project management and deadlines stress me out.") },
      { patientId: omar, contentEnc: encrypt("Evening walks on the Corniche help me unwind.") },
    ],
  });
  await prisma.wellbeingGoal.create({ data: { patientId: omar, title: "Walk 3 evenings a week" } });

  // ── Scenario 2: Layla — declining WHO-5 trend, not yet shared ──
  const layla = await createPatient({ email: "layla@demo.savethesoul.app", name: "Layla", ageBand: "35-44", createdDaysAgo: 80 });
  for (const [pct, d] of [[72, 70], [64, 56], [52, 42], [44, 28], [36, 14]] as const) await who5(layla, pct, d);
  await checkIns(layla, 30, (i) => ({ mood: clamp(1.8 + i / 12), stress: clamp(4.4 - i / 15), sleep: clamp(1.9 + i / 14), func: clamp(2 + i / 12) }));
  await prisma.patientProfile.update({
    where: { id: layla },
    data: { physicalHealthEnc: encrypt("Hypothyroidism, managed by my GP. Recent back pain affecting sleep.") },
  });
  await prisma.wellbeingGoal.createMany({
    data: [
      { patientId: layla, title: "Call my sister twice a week" },
      { patientId: layla, title: "Get outside in daylight every morning" },
    ],
  });
  const mariam = await prisma.trustedContact.create({
    data: {
      patientId: layla,
      name: "Mariam",
      relationship: "Sibling",
      phoneEnc: encrypt("+971 50 000 0000"),
      canReceiveUpdates: true,
      canReceiveSafetyAlerts: true,
      sharedCategories: ["CHECK_IN_REQUEST", "SAFETY_PLAN_SUPPORT"],
      isSafetyPlanContact: true,
    },
  });
  await prisma.consentRecord.create({
    data: {
      patientId: layla,
      scope: "TRUSTED_CONTACT_SHARING",
      granteeType: "TRUSTED_CONTACT",
      granteeId: mariam.id,
      categories: ["CHECK_IN_REQUEST", "SAFETY_PLAN_SUPPORT"],
      policyVersion: POLICY_VERSION,
    },
  });
  await prisma.safetyPlan.create({
    data: {
      patientId: layla,
      contentEnc: encryptJson({
        warningSigns: "Not sleeping, cancelling plans, staying in my room all weekend.",
        copingStrategies: "Shower and change clothes. Walk around the block. Make tea and sit on the balcony.",
        peopleAndPlaces: "Call Mariam. Go to the café near work.",
        reasonsForLiving: "My nephews. My cat, Zaatar. Visiting home in spring.",
        professionalContacts: "800-SAKINA (800 725462) — 24/7\nAmbulance 998 · Police 999",
        makingSafe: "Ask Mariam to keep my spare medication.",
      }),
    },
  });

  // ── Clinician caseload (Scenario 5) ────────────────────────
  async function shareWith(pid: string, clinicianId: string, categories: string[], d: number) {
    await prisma.careAssignment.create({ data: { patientId: pid, clinicianId, createdAt: daysAgo(d) } });
    const consent = await prisma.consentRecord.create({
      data: { patientId: pid, scope: "SHARE_SUMMARY_WITH_CLINICIAN", granteeType: "CLINICIAN", granteeId: clinicianId, categories, policyVersion: POLICY_VERSION, grantedAt: daysAgo(d) },
    });
    return consent.id;
  }

  async function addSummary(pid: string, clinicianId: string, consentId: string, name: string, scores: number[], d: number, reviewed: boolean) {
    await prisma.clinicalSummary.create({
      data: {
        patientId: pid,
        clinicianId,
        consentId,
        sharedAt: daysAgo(d),
        contentEnc: encryptJson({
          generatedAt: daysAgo(d).toISOString(),
          categories: ["WHO5_HISTORY", "MOOD_TRENDS", "PATIENT_NOTE"],
          patient: { preferredName: name, ageBand: null, region: "Abu Dhabi" },
          who5: scores.map((s, i) => ({ date: daysAgo(d + (scores.length - i) * 14).toISOString(), percentScore: s })),
          who5TrendNotes: ["Synthetic demo summary."],
          patientNote: "I'd like help managing stress and sleep. (synthetic)",
          limitations: ["Self-reported data; not clinically verified."],
          excluded: ["Private AI companion conversations are never included."],
        }),
        aiDraftEnc: encrypt(
          `UNVERIFIED AI DRAFT (synthetic)\n• WHO-5 percentage scores across ${scores.length} assessments: ${scores.join(" → ")}.\n• Patient note requests support with stress and sleep.\n• Self-report only; WHO-5 is not diagnostic and does not assess suicide risk.\nSuggested focus for review: recent stressors, sleep pattern, current supports.`,
        ),
        aiDraftStatus: reviewed ? "REVIEWED" : "UNVERIFIED",
        reviewedAt: reviewed ? daysAgo(d - 1) : null,
        reviewedByUserId: reviewed ? aisha.id : null,
      },
    });
  }

  const allCats = ["WHO5_HISTORY", "MOOD_TRENDS", "SLEEP_STRESS", "FUNCTIONING", "GOALS", "PATIENT_NOTE"];

  // Yousef — referral REQUESTED (needs acknowledgement)
  const yousef = await createPatient({ email: "yousef@demo.savethesoul.app", name: "Yousef", ageBand: "18-24", createdDaysAgo: 40 });
  for (const [pct, d] of [[56, 30], [48, 16], [40, 2]] as const) await who5(yousef, pct, d);
  await checkIns(yousef, 21, (i) => ({ mood: clamp(2 + i / 14), stress: clamp(4), sleep: clamp(2 + i / 20), func: clamp(2.5) }));
  const yConsent = await shareWith(yousef, aishaId, allCats, 3);
  await addSummary(yousef, aishaId, yConsent, "Yousef", [56, 48, 40], 2, false);
  const yRef = await prisma.careReferral.create({
    data: { patientId: yousef, clinicianId: aishaId, urgency: "SOON", status: "REQUESTED", reasonEnc: encrypt("University exams and not sleeping. (synthetic)"), requestedAt: daysAgo(2, 9) },
  });
  await prisma.referralEvent.create({ data: { referralId: yRef.id, toStatus: "REQUESTED", actorRole: "PATIENT", createdAt: daysAgo(2, 9) } });

  // Priya — referral SCHEDULED with upcoming follow-up
  const priya = await createPatient({ email: "priya@demo.savethesoul.app", name: "Priya", ageBand: "25-34", createdDaysAgo: 60 });
  for (const [pct, d] of [[48, 45], [52, 30], [60, 15]] as const) await who5(priya, pct, d);
  await checkIns(priya, 21, () => ({ mood: 3, stress: 3, sleep: 3, func: 3 }));
  const pConsent = await shareWith(priya, aishaId, ["WHO5_HISTORY", "MOOD_TRENDS", "PATIENT_NOTE"], 20);
  await addSummary(priya, aishaId, pConsent, "Priya", [48, 52, 60], 19, true);
  const pRef = await prisma.careReferral.create({
    data: { patientId: priya, clinicianId: aishaId, urgency: "ROUTINE", status: "SCHEDULED", requestedAt: daysAgo(19, 9), firstContactAt: daysAgo(18, 14) },
  });
  await prisma.referralEvent.createMany({
    data: [
      { referralId: pRef.id, toStatus: "REQUESTED", actorRole: "PATIENT", createdAt: daysAgo(19, 9) },
      { referralId: pRef.id, fromStatus: "REQUESTED", toStatus: "ACKNOWLEDGED", actorRole: "CLINICIAN", actorUserId: aisha.id, createdAt: daysAgo(18, 14) },
      { referralId: pRef.id, fromStatus: "ACKNOWLEDGED", toStatus: "SCHEDULED", actorRole: "CLINICIAN", actorUserId: aisha.id, createdAt: daysAgo(17, 11) },
    ],
  });
  await prisma.followUp.create({ data: { patientId: priya, clinicianId: aishaId, referralId: pRef.id, scheduledFor: daysAgo(-3, 15) } });

  // Hassan — referral COMPLETED with follow-up outcome; historical acknowledged simulated alert
  const hassan = await createPatient({ email: "hassan@demo.savethesoul.app", name: "Hassan", ageBand: "45-54", createdDaysAgo: 85 });
  for (const [pct, d] of [[32, 80], [40, 60], [52, 40], [64, 20]] as const) await who5(hassan, pct, d);
  await checkIns(hassan, 21, (i) => ({ mood: clamp(4 - i / 20), stress: 2, sleep: 4, func: 4 }));
  const hConsent = await shareWith(hassan, aishaId, allCats, 75);
  await addSummary(hassan, aishaId, hConsent, "Hassan", [32, 40], 74, true);
  const hRef = await prisma.careReferral.create({
    data: { patientId: hassan, clinicianId: aishaId, urgency: "SOON", status: "COMPLETED", requestedAt: daysAgo(74, 9), firstContactAt: daysAgo(74, 16), completedAt: daysAgo(45, 12) },
  });
  await prisma.referralEvent.createMany({
    data: [
      { referralId: hRef.id, toStatus: "REQUESTED", actorRole: "PATIENT", createdAt: daysAgo(74, 9) },
      { referralId: hRef.id, fromStatus: "REQUESTED", toStatus: "ACKNOWLEDGED", actorRole: "CLINICIAN", actorUserId: aisha.id, createdAt: daysAgo(74, 16) },
      { referralId: hRef.id, fromStatus: "ACKNOWLEDGED", toStatus: "SCHEDULED", actorRole: "CLINICIAN", actorUserId: aisha.id, createdAt: daysAgo(73, 10) },
      { referralId: hRef.id, fromStatus: "SCHEDULED", toStatus: "COMPLETED", actorRole: "CLINICIAN", actorUserId: aisha.id, createdAt: daysAgo(45, 12) },
    ],
  });
  await prisma.followUp.createMany({
    data: [
      { patientId: hassan, clinicianId: aishaId, referralId: hRef.id, scheduledFor: daysAgo(66, 15), status: "COMPLETED", functioningChange: 1, completedAt: daysAgo(66, 16) },
      { patientId: hassan, clinicianId: aishaId, referralId: hRef.id, scheduledFor: daysAgo(45, 15), status: "COMPLETED", functioningChange: 2, completedAt: daysAgo(45, 16) },
    ],
  });
  await prisma.safetyEvent.create({
    data: {
      patientId: hassan,
      level: "ELEVATED_CONCERN",
      source: "CHAT_INPUT",
      detector: "rules-v1",
      categories: ["HOPELESSNESS"],
      workflowStatus: "SIMULATED_ACKNOWLEDGED",
      simulatedAlertAt: daysAgo(70, 22),
      acknowledgedAt: daysAgo(70, 23),
      acknowledgedById: aisha.id,
      createdAt: daysAgo(70, 22),
    },
  });

  // Daniel — Dr. James's patient only (Dr. Aisha must NOT be able to see him)
  const daniel = await createPatient({ email: "daniel@demo.savethesoul.app", name: "Daniel", ageBand: "35-44", createdDaysAgo: 30 });
  await who5(daniel, 60, 10);
  await shareWith(daniel, jamesId, ["WHO5_HISTORY"], 9);
  const dRef = await prisma.careReferral.create({
    data: { patientId: daniel, clinicianId: jamesId, urgency: "ROUTINE", status: "UNABLE_TO_CONTACT", requestedAt: daysAgo(9, 9), firstContactAt: daysAgo(8, 9) },
  });
  await prisma.referralEvent.createMany({
    data: [
      { referralId: dRef.id, toStatus: "REQUESTED", actorRole: "PATIENT", createdAt: daysAgo(9, 9) },
      { referralId: dRef.id, fromStatus: "REQUESTED", toStatus: "ACKNOWLEDGED", actorRole: "CLINICIAN", actorUserId: james.id, createdAt: daysAgo(8, 9) },
      { referralId: dRef.id, fromStatus: "ACKNOWLEDGED", toStatus: "UNABLE_TO_CONTACT", actorRole: "CLINICIAN", actorUserId: james.id, note: "Two call attempts, no answer (synthetic)", createdAt: daysAgo(6, 9) },
    ],
  });

  // ── Aggregate analytics cohort (non-loginable synthetic patients) ──
  for (let i = 0; i < 14; i++) {
    const pid = await createPatient({ email: `cohort${i + 1}@synthetic.savethesoul.app`, name: `Cohort ${i + 1}`, loginable: false, createdDaysAgo: 95 });
    const base = 40 + ((i * 7) % 35);
    for (const [k, d] of [[0, 80], [1, 50], [2, 20]] as const) await who5(pid, Math.min(100, base + k * 4 + (i % 3) * 4), d);
    await checkIns(pid, 9, () => ({ mood: 3, stress: 3, sleep: 3, func: 3 }));
  }

  // ── Operational telemetry (synthetic) ─────────────────────
  await prisma.systemEvent.createMany({
    data: [
      ...Array.from({ length: 23 }, () => ({ kind: "CRISIS_WORKFLOW", code: "HELP_OPENED" })),
      ...Array.from({ length: 6 }, () => ({ kind: "CRISIS_WORKFLOW", code: "CALL_TAPPED" })),
      { kind: "LLM_ERROR", code: "TIMEOUT" },
      { kind: "LLM_ERROR", code: "UNAVAILABLE" },
      { kind: "OUTPUT_GUARD", code: "DIAGNOSIS" },
    ],
  });

  console.log("Seed complete. Demo password for all demo accounts:", DEMO_PASSWORD);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

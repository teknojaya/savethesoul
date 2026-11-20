/**
 * Targeted, IDEMPOTENT preparation of synthetic demo records for the hackathon:
 *  - a hospital emergency coordinator (one-click demo login only; random password) and fictional,
 *    SIMULATED emergency cases routed to the synthetic hospital;
 *  - two synthetic patients with fictional, CLINICIAN-AUTHORED example diagnoses and care plans.
 *
 * Nothing existing is overwritten or deleted: each item is created only if it does not exist,
 * and every created entity is reported. All people and records are fictional.
 */
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { encrypt, encryptJson } from "@/lib/crypto";
import { hashPassword } from "@/lib/auth/password";
import { scoreWho5 } from "@/features/assessments/who5";
import { POLICY_VERSION } from "@/features/consent/policy";
import { DEMO_PASSWORD } from "@/features/demo/accounts";
import { DEMO_HOSPITAL_ORG } from "@/server/services/emergency.service";
import { shareSummary } from "@/server/services/summary.service";
import { analyze } from "@/server/services/clinical-intelligence.service";

export const DEMO_RECORD_LABEL = "DEMO — Synthetic Patient and Fictional Clinical Record";
type EmergencyStatus = "DETECTED" | "REVIEW_REQUESTED" | "ACKNOWLEDGED" | "CONTACT_ATTEMPTED" | "ASSISTANCE_ARRANGED" | "RESOLVED" | "FAILED" | "CANCELLED" | "UNABLE_TO_CONTACT";

const DAY = 86_400_000;
const daysAgo = (d: number, hour = 10) => {
  const t = new Date(Date.now() - d * DAY);
  t.setHours(hour, 0, 0, 0);
  return t;
};
/** WHO-5 answer set (each item 0–5) summing to the target raw score. */
function answersFor(raw: number): number[] {
  const a = [0, 0, 0, 0, 0];
  for (let i = 0; i < raw; i++) a[i % 5] = Math.min(5, a[i % 5] + 1);
  return a;
}

export interface PrepareReport {
  created: string[];
  skipped: string[];
}

async function syntheticPatient(report: PrepareReport, email: string, name: string, ageBand: string) {
  const existing = await prisma.user.findUnique({ where: { email }, include: { patientProfile: true } });
  if (existing) {
    report.skipped.push(`patient ${email} (exists)`);
    return null;
  }
  const u = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(DEMO_PASSWORD),
      displayName: name,
      role: "PATIENT",
      isDemo: true,
      createdAt: daysAgo(70),
      patientProfile: { create: { preferredName: name, ageBand, onboardingCompleted: true } },
    },
    include: { patientProfile: true },
  });
  const pid = u.patientProfile!.id;
  await prisma.consentRecord.create({ data: { patientId: pid, scope: "AI_PROCESSING", categories: [], policyVersion: POLICY_VERSION, grantedAt: daysAgo(70) } });
  report.created.push(`patient ${email} (${pid})`);
  return { userId: u.id, patientId: pid };
}

async function demoClinician(email: string) {
  const u = await prisma.user.findUnique({ where: { email }, include: { clinicianProfile: true } });
  if (!u?.clinicianProfile || !u.isDemo) return null;
  return { userId: u.id, clinicianId: u.clinicianProfile.id, name: u.displayName };
}

interface ClinicalCase {
  email: string;
  name: string;
  ageBand: string;
  who5: number[];
  checkIn: { mood: number; stress: number; sleep: number; functioning: number };
  concerns: { areas: ("STRESS" | "LOW_MOOD" | "WORRY" | "SLEEP" | "WORK_STUDY")[]; duration: "1_TO_3_MONTHS" | "OVER_3_MONTHS"; frequency: "MOST_DAYS" | "OFTEN"; dailyLifeImpact: "SOME" | "A_LOT"; helpWanted: "ASSESSMENT" | "TALK_THERAPY" };
  careType: "PSYCHIATRIST" | "PSYCHOLOGIST";
  goals: string[];
  diagnosis: string;
  carePlan: string;
  notes: string[];
}

const CASES: ClinicalCase[] = [
  {
    email: "hana@demo.savethesoul.app",
    name: "Hana",
    ageBand: "25-34",
    who5: [56, 48, 44, 40],
    checkIn: { mood: 3, stress: 4, sleep: 2, functioning: 3 },
    concerns: { areas: ["WORRY", "SLEEP", "WORK_STUDY"], duration: "OVER_3_MONTHS", frequency: "MOST_DAYS", dailyLifeImpact: "A_LOT", helpWanted: "ASSESSMENT" },
    careType: "PSYCHIATRIST",
    goals: ["Try a 10-minute worry window each evening", "Keep a regular bedtime on weekdays"],
    diagnosis: `${DEMO_RECORD_LABEL}. Example clinician-authored diagnosis: Generalized Anxiety Disorder (ICD-10 F41.1). Basis (fictional): a comprehensive clinical evaluation including structured clinical interview, symptom timeline exceeding six months of excessive, difficult-to-control worry with restlessness, poor concentration, muscle tension and sleep disturbance, functional impact at work, and exclusion of medical and substance-related causes. WHO-5 results were considered as wellbeing context only, not as a diagnostic instrument.`,
    carePlan: `${DEMO_RECORD_LABEL}. Example care plan: CBT for anxiety (12 weekly sessions, worry exposure and cognitive restructuring); sleep-focused behavioural strategies; psychoeducation shared with the patient; medication options discussed in clinic as part of shared decision-making (no prescription is recorded in this demo); review in 4 weeks; patient advised to use the Help page and UAE emergency numbers if in crisis.`,
    notes: [
      `${DEMO_RECORD_LABEL}. Fictional assessment note: worry spans work, health and family; onset about 8 months ago after a role change; no safety concerns reported at assessment.`,
      `${DEMO_RECORD_LABEL}. Fictional follow-up note: practising the worry window most evenings; sleep onset improving slightly.`,
    ],
  },
  {
    email: "khalid@demo.savethesoul.app",
    name: "Khalid",
    ageBand: "35-44",
    who5: [52, 40, 32, 28],
    checkIn: { mood: 2, stress: 3, sleep: 2, functioning: 2 },
    concerns: { areas: ["LOW_MOOD", "SLEEP", "STRESS"], duration: "1_TO_3_MONTHS", frequency: "MOST_DAYS", dailyLifeImpact: "A_LOT", helpWanted: "TALK_THERAPY" },
    careType: "PSYCHIATRIST",
    goals: ["One short walk outside each day", "Message a friend twice a week"],
    diagnosis: `${DEMO_RECORD_LABEL}. Example clinician-authored diagnosis: Depressive episode, moderate (ICD-10 F32.1). Basis (fictional): a comprehensive clinical evaluation including clinical interview, symptom history of persistently low mood and markedly reduced interest for over two months, reduced energy, sleep disturbance and impaired work functioning, risk assessment by the clinician, and review of physical health with the primary-care physician. WHO-5 was used as wellbeing context only, not as a diagnostic instrument.`,
    carePlan: `${DEMO_RECORD_LABEL}. Example care plan: behavioural activation and CBT (weekly), activity scheduling, sleep routine, involvement of a trusted person if the patient wishes; pharmacological options discussed in clinic as part of shared decision-making (no prescription is recorded in this demo); safety plan reviewed; follow-up in 2 weeks.`,
    notes: [
      `${DEMO_RECORD_LABEL}. Fictional assessment note: reports low mood and loss of enjoyment since a period of work stress; sleeping poorly; supportive family.`,
    ],
  },
];

async function prepareClinicalCase(report: PrepareReport, c: ClinicalCase, aisha: { userId: string; clinicianId: string; name: string }) {
  const p = await syntheticPatient(report, c.email, c.name, c.ageBand);
  if (!p) return;
  const { patientId } = p;

  for (let i = 0; i < c.who5.length; i++) {
    const s = scoreWho5(answersFor(Math.round(c.who5[i] / 4)));
    if (!s.ok) throw new Error("invalid demo WHO-5 answers");
    await prisma.wellbeingAssessment.create({
      data: { patientId, instrument: "WHO5", answers: s.answers, rawScore: s.rawScore, percentScore: s.percentScore, completedAt: daysAgo(56 - i * 14) },
    });
  }
  for (let d = 13; d >= 0; d--) {
    await prisma.wellbeingCheckIn.create({
      data: { patientId, mood: c.checkIn.mood, stress: c.checkIn.stress, sleepQuality: c.checkIn.sleep, functioning: c.checkIn.functioning, createdAt: daysAgo(d, 20) },
    });
  }
  await prisma.wellbeingGoal.createMany({ data: c.goals.map((title) => ({ patientId, title })) });

  const ref = await prisma.careReferral.create({
    data: { patientId, clinicianId: aisha.clinicianId, urgency: "SOON", status: "COMPLETED", careType: c.careType, isSimulated: true, reasonEnc: encrypt(`${DEMO_RECORD_LABEL}. Patient requested a professional assessment.`), requestedAt: daysAgo(30), firstContactAt: daysAgo(28), completedAt: daysAgo(21) },
  });
  await prisma.referralEvent.createMany({
    data: [
      { referralId: ref.id, toStatus: "REQUESTED", actorRole: "PATIENT", simulated: true, createdAt: daysAgo(30) },
      { referralId: ref.id, fromStatus: "REQUESTED", toStatus: "ACKNOWLEDGED", actorRole: "CLINICIAN", simulated: true, createdAt: daysAgo(28) },
      { referralId: ref.id, fromStatus: "ACKNOWLEDGED", toStatus: "SCHEDULED", actorRole: "CLINICIAN", simulated: true, createdAt: daysAgo(27) },
      { referralId: ref.id, fromStatus: "SCHEDULED", toStatus: "COMPLETED", actorRole: "CLINICIAN", simulated: true, createdAt: daysAgo(21) },
    ],
  });
  await prisma.followUp.create({ data: { patientId, clinicianId: aisha.clinicianId, referralId: ref.id, scheduledFor: daysAgo(-7, 11) } });

  // Patient-approved summary (category-scoped consent + assignment). An AI draft is generated only
  // where a real language model is configured, and passes the grounding filter.
  await shareSummary(patientId, aisha.clinicianId, ["WHO5_HISTORY", "MOOD_TRENDS", "SLEEP_STRESS", "FUNCTIONING", "GOALS", "REPORTED_CONCERNS", "REFERRAL_HISTORY"], null, c.concerns);

  // Clinician-authored fictional findings and notes (never AI-generated), with audit entries.
  for (const [kind, text, d] of [["DIAGNOSIS", c.diagnosis, 21], ["CARE_PLAN", c.carePlan, 21]] as const) {
    const f = await prisma.clinicianFinding.create({ data: { patientId, clinicianId: aisha.clinicianId, authorUserId: aisha.userId, kind, contentEnc: encrypt(text), createdAt: daysAgo(d, 15) } });
    await prisma.auditLog.create({ data: { actorUserId: aisha.userId, actorRole: "CLINICIAN", action: `FINDING_CREATED_${kind}`, resourceType: "ClinicianFinding", resourceId: f.id, subjectPatientId: patientId, createdAt: daysAgo(d, 15) } });
  }
  for (let i = 0; i < c.notes.length; i++) {
    await prisma.clinicianNote.create({ data: { patientId, clinicianId: aisha.clinicianId, contentEnc: encrypt(c.notes[i]), createdAt: daysAgo(21 - i * 10, 16) } });
  }
  report.created.push(`clinical case ${c.name}: WHO-5 ×${c.who5.length}, check-ins ×14, goals, referral + follow-up, shared summary, diagnosis + care plan, notes`);
}

interface CaseSeed {
  caseRef: string;
  status: EmergencyStatus;
  concernType: string;
  context: string;
  location: string;
  responder: string | null;
  path: EmergencyStatus[];
  hoursAgo: number;
  linkPatient?: boolean;
}

const EMERGENCY_CASES: CaseSeed[] = [
  { caseRef: "SIM-ER-1001", status: "REVIEW_REQUESTED", concernType: "Immediate danger disclosed (patient-initiated alert)", context: "The synthetic patient used the in-app safety pathway and chose to send an alert. Detector categories: SUICIDE_INTENT. No message text is shared.", location: "Fictional: Khalifa City, Abu Dhabi (synthetic location)", responder: null, path: ["DETECTED", "REVIEW_REQUESTED"], hoursAgo: 1, linkPatient: true },
  { caseRef: "SIM-ER-1002", status: "ACKNOWLEDGED", concernType: "Self-harm concern (patient-initiated alert)", context: "Patient-initiated alert after the safety check-in. Detector categories: SELF_HARM. No message text is shared.", location: "Fictional: Al Reem Island, Abu Dhabi (synthetic location)", responder: "Demo coordinator (synthetic)", path: ["DETECTED", "REVIEW_REQUESTED", "ACKNOWLEDGED"], hoursAgo: 5 },
  { caseRef: "SIM-ER-1003", status: "ASSISTANCE_ARRANGED", concernType: "Immediate danger disclosed (patient-initiated alert)", context: "Patient-initiated alert. Detector categories: SUICIDE_INTENT. No message text is shared.", location: "Fictional: Mussafah, Abu Dhabi (synthetic location)", responder: "Demo crisis nurse (synthetic)", path: ["DETECTED", "REVIEW_REQUESTED", "ACKNOWLEDGED", "CONTACT_ATTEMPTED", "ASSISTANCE_ARRANGED"], hoursAgo: 20 },
  { caseRef: "SIM-ER-1004", status: "RESOLVED", concernType: "Unsafe at home (patient-initiated alert)", context: "Patient-initiated alert. Detector categories: UNSAFE_ENVIRONMENT. No message text is shared.", location: "Fictional: Al Ain (synthetic location)", responder: "Demo social worker (synthetic)", path: ["DETECTED", "REVIEW_REQUESTED", "ACKNOWLEDGED", "CONTACT_ATTEMPTED", "ASSISTANCE_ARRANGED", "RESOLVED"], hoursAgo: 72 },
  { caseRef: "SIM-ER-1005", status: "UNABLE_TO_CONTACT", concernType: "Immediate danger disclosed (patient-initiated alert)", context: "Patient-initiated alert. Detector categories: SUICIDE_INTENT. No message text is shared.", location: "Fictional: Yas Island, Abu Dhabi (synthetic location)", responder: "Demo coordinator (synthetic)", path: ["DETECTED", "REVIEW_REQUESTED", "ACKNOWLEDGED", "CONTACT_ATTEMPTED", "UNABLE_TO_CONTACT"], hoursAgo: 9 },
];

async function prepareHospital(report: PrepareReport) {
  const email = "coordinator@demo.savethesoul.app";
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Random password that is never shown: the account is reachable only through demo-mode one-click sign-in.
    user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(randomBytes(24).toString("base64url")),
        displayName: "Emergency Coordinator (synthetic)",
        role: "HOSPITAL_COORDINATOR",
        isDemo: true,
        hospitalProfile: { create: { organization: DEMO_HOSPITAL_ORG, title: "Emergency coordination desk (demo)" } },
      },
    });
    report.created.push(`hospital coordinator ${email}`);
  } else report.skipped.push(`hospital coordinator ${email} (exists)`);

  // Synthetic patient for the family-coordination example (authorised trusted contact).
  let saraId: string | null = (await prisma.user.findUnique({ where: { email: "sara@demo.savethesoul.app" }, include: { patientProfile: true } }))?.patientProfile?.id ?? null;
  if (!saraId) {
    const p = await syntheticPatient(report, "sara@demo.savethesoul.app", "Sara", "18-24");
    saraId = p!.patientId;
    const contact = await prisma.trustedContact.create({
      data: { patientId: saraId, name: "Mariam (synthetic)", relationship: "Parent", phoneEnc: encrypt("+971 50 000 0001"), canReceiveUpdates: true, canReceiveSafetyAlerts: true, sharedCategories: ["SAFETY_PLAN_SUPPORT", "CHECK_IN_REQUEST"], isSafetyPlanContact: true, recipientVerified: false },
    });
    await prisma.consentRecord.create({ data: { patientId: saraId, scope: "TRUSTED_CONTACT_SHARING", granteeType: "TRUSTED_CONTACT", granteeId: contact.id, categories: ["SAFETY_PLAN_SUPPORT", "CHECK_IN_REQUEST"], policyVersion: POLICY_VERSION } });
    await prisma.safetyPlan.create({ data: { patientId: saraId, contentEnc: encryptJson({ warningSigns: ["Synthetic example"], copingSteps: ["Call Mariam"], people: ["Mariam (synthetic)"] }) } }).catch(() => null);
  }

  for (const c of EMERGENCY_CASES) {
    if (await prisma.emergencyCase.findUnique({ where: { caseRef: c.caseRef } })) {
      report.skipped.push(`emergency case ${c.caseRef} (exists)`);
      continue;
    }
    const start = Date.now() - c.hoursAgo * 3_600_000;
    await prisma.emergencyCase.create({
      data: {
        caseRef: c.caseRef,
        patientId: c.linkPatient ? saraId : null,
        hospitalOrg: DEMO_HOSPITAL_ORG,
        status: c.status,
        concernType: c.concernType,
        contextEnc: encrypt(c.context),
        locationEnc: encrypt(c.location),
        authorizationStatus: "Synthetic demo record: fictional emergency-disclosure authorisation. A real deployment needs explicit, lawful authorisation.",
        assignedResponder: c.responder,
        createdAt: new Date(start),
        events: {
          create: c.path.map((to, i) => ({
            kind: "TRANSITION",
            fromStatus: i === 0 ? null : c.path[i - 1],
            toStatus: to,
            actorRole: i === 0 ? "SAFETY_GUARDIAN" : i === 1 ? "PATIENT" : "HOSPITAL_COORDINATOR",
            noteEnc: i >= 2 ? encrypt(`Fictional response note (${to.toLowerCase().replace(/_/g, " ")}).`) : null,
            simulated: true,
            createdAt: new Date(start + i * 12 * 60_000),
          })),
        },
      },
    });
    report.created.push(`emergency case ${c.caseRef} (${c.status})`);
  }
}

/**
 * Demo of Sakinah detecting INDIRECT suicide warning signs (no explicit statement) for a synthetic
 * patient who pre-authorised emergency escalation in their safety plan. The hospital receives
 * Sakinah's risk report, last known location and authorised contacts, and a human acts on it.
 * Demo data only: the live app never escalates to a hospital from an AI flag on its own.
 */
export const AI_CASE_REF = "SIM-ER-1006";
async function prepareAiDetectedCase(report: PrepareReport) {
  if (await prisma.emergencyCase.findUnique({ where: { caseRef: AI_CASE_REF } })) {
    report.skipped.push(`emergency case ${AI_CASE_REF} (exists)`);
    return;
  }
  const email = "noura@demo.savethesoul.app";
  let pid = (await prisma.user.findUnique({ where: { email }, include: { patientProfile: true } }))?.patientProfile?.id ?? null;
  if (!pid) {
    const p = await syntheticPatient(report, email, "Noura", "25-34");
    pid = p!.patientId;
    const contact = await prisma.trustedContact.create({
      data: { patientId: pid, name: "Huda", relationship: "Sister", phoneEnc: encrypt("+971 55 000 0012"), canReceiveUpdates: true, canReceiveSafetyAlerts: true, sharedCategories: ["SAFETY_PLAN_SUPPORT", "CHECK_IN_REQUEST"], isSafetyPlanContact: true, recipientVerified: true },
    });
    await prisma.consentRecord.create({ data: { patientId: pid, scope: "TRUSTED_CONTACT_SHARING", granteeType: "TRUSTED_CONTACT", granteeId: contact.id, categories: ["SAFETY_PLAN_SUPPORT", "CHECK_IN_REQUEST"], policyVersion: POLICY_VERSION, grantedAt: daysAgo(18) } });
    await prisma.safetyPlan.create({ data: { patientId: pid, contentEnc: encryptJson({ warningSigns: ["Not sleeping", "Feeling like a burden"], copingSteps: ["Call Huda", "Breathing exercise"], people: ["Huda"] }) } }).catch(() => null);
  }
  const start = Date.now() - 6 * 60_000;
  const report_ = [
    "Sakinah AI risk report: indirect suicide warning signs (no explicit statement of intent)",
    "",
    "Signals detected over the last 72 hours:",
    "• Repeatedly described herself as a burden to her family (\"they would be better off\")",
    "• Mentioned giving away belongings and \"putting things in order\"",
    "• Goodbye-like messages late at night; hopelessness about the future",
    "• Sleep collapse: 2–3 hours a night for 5 nights; WHO-5 fell from 48 to 16 in two weeks",
    "• Withdrawal: cancelled plans and stopped replying to friends",
    "",
    "Sakinah's assessment: high-concern pattern consistent with recognised suicide warning signs. AI flag for urgent human review, not a diagnosis.",
    "Recommended immediate action: welfare call within 15 minutes. If unreachable, call the emergency contact and consider an ambulance (998).",
    "",
    "Patient: Noura, 25–34 · mobile +971 50 ••• ••47",
    "Emergency contact: Huda (sister) · mobile +971 55 ••• ••12 · authorised in safety plan",
    "Patient informed in-app that her care team has been alerted.",
  ].join("\n");
  await prisma.emergencyCase.create({
    data: {
      caseRef: AI_CASE_REF,
      patientId: pid,
      hospitalOrg: DEMO_HOSPITAL_ORG,
      status: "REVIEW_REQUESTED",
      concernType: "Suicide warning signs detected by Sakinah AI (indirect)",
      contextEnc: encrypt(report_),
      locationEnc: encrypt("Al Reem Island, Abu Dhabi · last known device location, 6 minutes ago"),
      authorizationStatus: "Pre-authorised emergency escalation in the patient's safety plan (consent recorded 18 days ago).",
      createdAt: new Date(start),
      events: {
        create: [
          { kind: "AI_RISK_SIGNAL", toStatus: "DETECTED", actorRole: "SAKINAH_AI", noteEnc: encrypt("Sakinah detected a pattern of indirect suicide warning signs across recent conversations, check-ins and WHO-5."), simulated: true, createdAt: new Date(start) },
          { kind: "TRANSITION", fromStatus: "DETECTED", toStatus: "REVIEW_REQUESTED", actorRole: "SAKINAH_AI", noteEnc: encrypt("Escalated to the hospital emergency desk under the patient's pre-authorised emergency consent. Risk report, location and authorised contacts attached."), simulated: true, createdAt: new Date(start + 30_000) },
        ],
      },
    },
  });
  report.created.push(`emergency case ${AI_CASE_REF} (Sakinah AI-detected, REVIEW_REQUESTED)`);
}

/** Demo: Hana chooses to share her Sakinah conversations with Dr. Aisha (explicit, revocable consent). */
const SHARED_CHAT_TITLE = "Worry keeping me up at night";
async function prepareSharedChat(report: PrepareReport, aisha: { clinicianId: string }) {
  const u = await prisma.user.findUnique({ where: { email: "hana@demo.savethesoul.app" }, include: { patientProfile: true } });
  const pid = u?.isDemo ? u.patientProfile?.id : null;
  if (!pid) return report.skipped.push("shared conversations (Hana not found)");
  if (await prisma.conversation.findFirst({ where: { patientId: pid, title: SHARED_CHAT_TITLE } })) return report.skipped.push("shared conversations for Hana (exist)");
  const t0 = Date.now() - 2 * DAY;
  const turns: ["USER" | "ASSISTANT", string][] = [
    ["USER", "I can't switch my brain off at night. I keep going over everything that could go wrong at work and with my mum's health."],
    ["ASSISTANT", "That sounds exhausting, Hana. When worries pile up at night it can feel impossible to rest. How long has it been like this?"],
    ["USER", "Months, honestly. Since I changed roles in spring. Most nights I'm awake until 2 or 3, then I feel shaky and tense all day."],
    ["ASSISTANT", "Thank you for telling me. Months of poor sleep and constant worry is a lot to carry. Is it affecting your work or the things you enjoy?"],
    ["USER", "I keep making small mistakes and I've stopped going to the gym. I get irritable with my husband over nothing. I just feel on edge all the time."],
    ["ASSISTANT", "That makes sense: when you're running on so little sleep, everything feels harder. You mentioned you're seeing Dr. Aisha. The worry window you've been practising is a good step. Would it help to note down what you'd like to tell her at your next appointment?"],
    ["USER", "Yes. I don't feel unsafe or anything like that, I just want it to stop. Can you help me write the list?"],
    ["ASSISTANT", "Of course. Here's a start: worry most days for several months, hard to control; sleep onset 2–3 hours; muscle tension and irritability; mistakes at work; stopped exercising. You might also mention what has helped a little, like the worry window. I'm an AI and can't diagnose, but Dr. Aisha can look at all of this with you."],
  ];
  await prisma.conversation.create({
    data: {
      patientId: pid,
      title: SHARED_CHAT_TITLE,
      createdAt: new Date(t0),
      messages: { create: turns.map(([role, text], i) => ({ role, contentEnc: encrypt(text), provider: role === "ASSISTANT" ? "openai" : null, createdAt: new Date(t0 + i * 90_000) })) },
    },
  });
  const latest = await prisma.consentRecord.findFirst({
    where: { patientId: pid, scope: "SHARE_SUMMARY_WITH_CLINICIAN", granteeType: "CLINICIAN", granteeId: aisha.clinicianId, revokedAt: null },
    orderBy: { grantedAt: "desc" },
  });
  if (latest && !latest.categories.includes("CONVERSATIONS")) {
    await prisma.consentRecord.create({
      data: { patientId: pid, scope: "SHARE_SUMMARY_WITH_CLINICIAN", granteeType: "CLINICIAN", granteeId: aisha.clinicianId, categories: [...latest.categories, "CONVERSATIONS"], policyVersion: POLICY_VERSION },
    });
  }
  report.created.push("shared conversations: Hana → Dr. Aisha (explicit consent)");
}

/**
 * Clinical Intelligence demo: Maya (synthetic) has turned on "Allow Sakinah to help understand my
 * wellbeing" and then talked with Sakinah. Her first insights are prepared by the real engine when
 * a language model is configured (never fabricated offline). Not shared with anyone until she
 * approves and shares them herself.
 */
async function prepareClinicalIntelligenceDemo(report: PrepareReport) {
  const email = "maya@demo.savethesoul.app";
  if (await prisma.user.findUnique({ where: { email } })) return report.skipped.push(`patient ${email} (exists)`);
  const p = await syntheticPatient(report, email, "Maya", "25-34");
  if (!p) return;
  const t0 = Date.now() - 26 * 3_600_000;
  await prisma.consentRecord.create({ data: { patientId: p.patientId, scope: "CLINICAL_INTELLIGENCE", categories: [], policyVersion: POLICY_VERSION, grantedAt: new Date(t0 - 60_000) } });
  for (const [i, pct] of [56, 44].entries()) {
    const s = scoreWho5(answersFor(Math.round(pct / 4)));
    if (!s.ok) throw new Error("demo WHO-5");
    await prisma.wellbeingAssessment.create({ data: { patientId: p.patientId, instrument: "WHO5", answers: s.answers, rawScore: s.rawScore, percentScore: s.percentScore, completedAt: daysAgo(15 - i * 14) } });
  }
  for (const d of [6, 4, 2, 1]) {
    await prisma.wellbeingCheckIn.create({ data: { patientId: p.patientId, mood: 2, stress: 4, sleepQuality: 2, functioning: 2, createdAt: daysAgo(d, 21) } });
  }
  const turns: ["USER" | "ASSISTANT", string][] = [
    ["USER", "I've been constantly worried about my work, I struggle to sleep, and lately I can't concentrate. It's been happening for about three weeks."],
    ["ASSISTANT", "Thank you for telling me, Maya. Three weeks of constant worry and poor sleep is exhausting, and it makes sense that concentrating feels harder. When the worry shows up at night, what tends to be on your mind?"],
    ["USER", "Mostly deadlines and whether my manager thinks I'm failing. I lie awake until 2am and then I'm exhausted at work and keep making small mistakes."],
    ["ASSISTANT", "That sounds like a hard cycle: worry keeps you awake, tiredness makes work harder, and that feeds the worry. You're not failing for feeling this way. Would it help to try a short wind-down routine tonight, or to talk about what support might help?"],
    ["USER", "I tried cutting coffee after lunch but it didn't really help. I've also stopped going to my evening walks because I feel too drained."],
  ];
  await prisma.conversation.create({
    data: {
      patientId: p.patientId,
      title: "Conversation · worry and sleep",
      createdAt: new Date(t0),
      messages: { create: turns.map(([role, text], i) => ({ role, contentEnc: encrypt(text), provider: role === "ASSISTANT" ? "openai" : null, createdAt: new Date(t0 + i * 120_000) })) },
    },
  });
  const r = await analyze(p.patientId, { trigger: "demo" }).catch(() => ({ status: "FAILED" as const }));
  report.created.push(`Clinical Intelligence demo for Maya (insights: ${r.status})`);
}

export async function prepareDemo(): Promise<PrepareReport> {
  const report: PrepareReport = { created: [], skipped: [] };
  const aisha = await demoClinician("dr.aisha@demo.savethesoul.app");
  if (aisha) {
    for (const c of CASES) await prepareClinicalCase(report, c, aisha);
    await prepareSharedChat(report, aisha);
  }
  else report.skipped.push("clinical cases (demo clinician Dr. Aisha not found)");
  await prepareHospital(report);
  await prepareAiDetectedCase(report);
  await prepareClinicalIntelligenceDemo(report);
  return report;
}

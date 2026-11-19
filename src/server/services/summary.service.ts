import { prisma } from "@/lib/db/prisma";
import { decryptJson, decryptOptional, encrypt, encryptJson, decrypt } from "@/lib/crypto";
import type { Actor } from "@/lib/auth/session";
import { AppError, notFound } from "@/lib/errors";
import { getEnv } from "@/lib/env";
import { CLINICIAN_SHARE_CATEGORIES, CONCERN_AREAS, CONCERN_DURATION, CONCERN_FREQUENCY, CONCERN_IMPACT, HELP_WANTED, POLICY_VERSION, type ClinicianShareCategory } from "@/features/consent/policy";
import type { z } from "zod";
import type { ReportedConcernsSchema } from "@/lib/validation/schemas";

export type ReportedConcernsInput = z.infer<typeof ReportedConcernsSchema>;

export { AI_SUMMARY_LABEL } from "@/features/ai/prompts";
import { computeWho5Trend, summariseCheckIns } from "@/features/assessments/trends";
import { WHO5_LIMITATIONS } from "@/features/assessments/who5";
import { getChatProvider } from "@/features/ai/provider-factory";
import { CLINICIAN_SUMMARY_SYSTEM_PROMPT } from "@/features/ai/prompts";
import { buildDraftInput, groundClinicalDraft } from "@/features/ai/clinical-draft";
import { audit, recordSystemEvent } from "./audit.service";
import { requireClinicianAccess } from "./access.service";
import { listCheckIns } from "./wellbeing.service";
import { cleanDemoText } from "@/lib/demo-text";

export interface SummaryContent {
  generatedAt: string;
  categories: ClinicianShareCategory[];
  patient: { preferredName: string; ageBand: string | null; region: string };
  who5?: { date: string; percentScore: number }[];
  who5TrendNotes?: string[];
  mood?: { recentAvg: number | null; priorAvg: number | null; recentCount: number };
  sleepStress?: { sleepRecent: number | null; sleepPrior: number | null; stressRecent: number | null; stressPrior: number | null };
  functioning?: { recentAvg: number | null; priorAvg: number | null };
  goals?: string[];
  physicalHealthContext?: string | null;
  patientNote?: string | null;
  /** Patient-reported (chosen by the patient in the share form; never inferred by AI). */
  reportedConcerns?: { areas: string[]; duration: string; frequency: string; dailyLifeImpact: string; helpWanted: string | null };
  referralHistory?: { requestedAt: string; status: string; careType: string | null; with: string | null }[];
  limitations: string[];
  excluded: string[];
}

/** Lists clinicians a patient may choose to share with (synthetic directory in the prototype). */
export async function listShareableClinicians() {
  const rows = await prisma.clinicianProfile.findMany({
    include: { user: { select: { displayName: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.user.displayName,
    title: c.title,
    specialty: c.specialty,
    organization: c.organization,
    isSynthetic: c.isSynthetic,
  }));
}

/** Deterministically builds the summary from structured data. No chat content, no AI. */
export async function buildSummaryContent(
  patientId: string,
  categories: ClinicianShareCategory[],
  patientNote?: string | null,
  reportedConcerns?: ReportedConcernsInput | null,
): Promise<SummaryContent> {
  const profile = await prisma.patientProfile.findUniqueOrThrow({ where: { id: patientId } });
  const has = (c: ClinicianShareCategory) => categories.includes(c);
  const content: SummaryContent = {
    generatedAt: new Date().toISOString(),
    categories,
    patient: { preferredName: profile.preferredName, ageBand: profile.ageBand, region: profile.region },
    limitations: [
      "Self-reported data; not clinically verified.",
      WHO5_LIMITATIONS[1],
      WHO5_LIMITATIONS[2],
    ],
    excluded: [
      ...(has("CONVERSATIONS") ? ["Conversations are shared separately as read-only history and are never sent to the AI draft."] : ["Private AI companion conversations are not included."]),
      ...Object.entries(CLINICIAN_SHARE_CATEGORIES)
        .filter(([k]) => !has(k as ClinicianShareCategory))
        .map(([, label]) => `Not shared: ${label}`),
    ],
  };

  if (has("WHO5_HISTORY")) {
    const a = await prisma.wellbeingAssessment.findMany({ where: { patientId }, orderBy: { completedAt: "asc" } });
    content.who5 = a.map((x) => ({ date: x.completedAt.toISOString(), percentScore: x.percentScore }));
    content.who5TrendNotes = computeWho5Trend(a).explanations;
  }
  if (has("MOOD_TRENDS") || has("SLEEP_STRESS") || has("FUNCTIONING")) {
    const s = summariseCheckIns(await listCheckIns(patientId, 30));
    if (has("MOOD_TRENDS")) content.mood = { recentAvg: s.mood.recent, priorAvg: s.mood.prior, recentCount: s.recentCount };
    if (has("SLEEP_STRESS")) {
      content.sleepStress = {
        sleepRecent: s.sleepQuality.recent,
        sleepPrior: s.sleepQuality.prior,
        stressRecent: s.stress.recent,
        stressPrior: s.stress.prior,
      };
    }
    if (has("FUNCTIONING")) content.functioning = { recentAvg: s.functioning.recent, priorAvg: s.functioning.prior };
  }
  if (has("GOALS")) {
    const goals = await prisma.wellbeingGoal.findMany({ where: { patientId, status: "ACTIVE" } });
    content.goals = goals.map((g) => g.title);
  }
  if (has("PHYSICAL_HEALTH_CONTEXT")) content.physicalHealthContext = decryptOptional(profile.physicalHealthEnc);
  if (has("PATIENT_NOTE")) content.patientNote = patientNote ?? null;
  if (has("REPORTED_CONCERNS") && reportedConcerns) {
    content.reportedConcerns = {
      areas: reportedConcerns.areas.map((a) => CONCERN_AREAS[a]),
      duration: CONCERN_DURATION[reportedConcerns.duration],
      frequency: CONCERN_FREQUENCY[reportedConcerns.frequency],
      dailyLifeImpact: CONCERN_IMPACT[reportedConcerns.dailyLifeImpact],
      helpWanted: reportedConcerns.helpWanted ? HELP_WANTED[reportedConcerns.helpWanted] : null,
    };
  }
  if (has("REFERRAL_HISTORY")) {
    const refs = await prisma.careReferral.findMany({
      where: { patientId },
      orderBy: { requestedAt: "asc" },
      include: { clinician: { include: { user: { select: { displayName: true } } } }, resource: { select: { name: true } } },
    });
    content.referralHistory = refs.map((r) => ({
      requestedAt: r.requestedAt.toISOString(),
      status: r.status,
      careType: r.careType,
      with: r.clinician?.user.displayName ?? r.resource?.name ?? null,
    }));
  }
  return content;
}

export async function previewSummary(
  patientId: string,
  clinicianId: string,
  categories: ClinicianShareCategory[],
  patientNote?: string | null,
  reportedConcerns?: ReportedConcernsInput | null,
) {
  const clinician = await prisma.clinicianProfile.findUnique({ where: { id: clinicianId } });
  if (!clinician) throw notFound("Clinician not found");
  return buildSummaryContent(patientId, categories, patientNote, reportedConcerns);
}

/**
 * Shares an approved summary with ONE clinician:
 *  - records a category-scoped consent (superseding any earlier one for this clinician)
 *  - connects the patient to the clinician's care list (assignment)
 *  - stores the encrypted snapshot, plus an UNVERIFIED AI draft if available
 */
export async function shareSummary(
  patientId: string,
  clinicianId: string,
  categories: ClinicianShareCategory[],
  patientNote?: string | null,
  reportedConcerns?: ReportedConcernsInput | null,
) {
  const clinician = await prisma.clinicianProfile.findUnique({ where: { id: clinicianId } });
  if (!clinician) throw notFound("Clinician not found");
  const content = await buildSummaryContent(patientId, categories, patientNote, reportedConcerns);

  const summary = await prisma.$transaction(async (tx) => {
    const now = new Date();
    await tx.consentRecord.updateMany({
      where: { patientId, scope: "SHARE_SUMMARY_WITH_CLINICIAN", granteeId: clinicianId, revokedAt: null },
      data: { revokedAt: now },
    });
    // A new share supersedes earlier snapshots, so data the patient has since
    // excluded never remains visible through an older summary.
    await tx.clinicalSummary.updateMany({
      where: { patientId, clinicianId, status: "SHARED" },
      data: { status: "REVOKED", revokedAt: now },
    });
    const consent = await tx.consentRecord.create({
      data: {
        patientId,
        scope: "SHARE_SUMMARY_WITH_CLINICIAN",
        granteeType: "CLINICIAN",
        granteeId: clinicianId,
        categories,
        policyVersion: POLICY_VERSION,
      },
    });
    await tx.careAssignment.upsert({
      where: { patientId_clinicianId: { patientId, clinicianId } },
      create: { patientId, clinicianId, status: "ACTIVE" },
      update: { status: "ACTIVE" },
    });
    return tx.clinicalSummary.create({
      data: { patientId, clinicianId, consentId: consent.id, contentEnc: encryptJson(content) },
    });
  });

  const draft = await generateAiDraft(content);
  if (draft) {
    await prisma.clinicalSummary.update({ where: { id: summary.id }, data: { aiDraftEnc: encrypt(draft.text) } });
  }
  return { id: summary.id, sharedAt: summary.sharedAt, aiDraft: draft ? { provider: draft.provider } : null };
}

async function generateAiDraft(content: SummaryContent): Promise<{ text: string; provider: string } | null> {
  const provider = getChatProvider();
  // The offline demo companion is not a language model: it must never pose as an AI clinical draft.
  if (!provider.isGenerative) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), getEnv().LLM_TIMEOUT_MS);
  try {
    // Only the structured, patient-approved snapshot is sent — never conversations — with each
    // kind of information (demographics, patient reports, assessments…) in its own section.
    const text = await provider.complete({
      system: CLINICIAN_SUMMARY_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Patient-approved structured data (JSON):\n${JSON.stringify(buildDraftInput(content))}` }],
      signal: controller.signal,
      maxTokens: 4000,
    });
    // Unsupported statements are removed before any clinician sees the draft.
    const grounded = groundClinicalDraft(text, content);
    if (grounded.removed) await recordSystemEvent("AI_DRAFT_FILTERED", `${grounded.removed}`);
    return grounded.text ? { text: grounded.text, provider: provider.id } : null;
  } catch {
    await recordSystemEvent("LLM_ERROR", "SUMMARY_DRAFT_FAILED");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Patient stops sharing with a clinician: revokes all active consents and summaries for them. */
export async function stopSharingWithClinician(patientId: string, summaryId: string) {
  const s = await prisma.clinicalSummary.findFirst({ where: { id: summaryId, patientId } });
  if (!s) throw notFound("Summary not found");
  const now = new Date();
  await prisma.$transaction([
    prisma.consentRecord.updateMany({
      where: { patientId, scope: "SHARE_SUMMARY_WITH_CLINICIAN", granteeId: s.clinicianId, revokedAt: null },
      data: { revokedAt: now },
    }),
    prisma.clinicalSummary.updateMany({
      where: { patientId, clinicianId: s.clinicianId, status: "SHARED" },
      data: { status: "REVOKED", revokedAt: now },
    }),
  ]);
}

export async function listPatientSummaries(patientId: string) {
  const rows = await prisma.clinicalSummary.findMany({
    where: { patientId },
    orderBy: { sharedAt: "desc" },
    include: { clinician: { include: { user: { select: { displayName: true } } } } },
  });
  return rows.map((r) => ({
    id: r.id,
    clinicianName: r.clinician.user.displayName,
    clinicianOrg: r.clinician.organization,
    consentId: r.consentId,
    status: r.status,
    sharedAt: r.sharedAt,
    revokedAt: r.revokedAt,
    reviewedAt: r.reviewedAt,
    categories: decryptJson<SummaryContent>(r.contentEnc).categories,
  }));
}

/** Clinician view: only SHARED summaries addressed to this clinician, gated by live consent. */
export async function listSummariesForClinician(actor: Actor, patientId: string) {
  const { clinicianId } = await requireClinicianAccess(actor, patientId, "VIEW_CLINICAL_SUMMARIES");
  const rows = await prisma.clinicalSummary.findMany({
    where: { patientId, clinicianId, status: "SHARED" },
    orderBy: { sharedAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    sharedAt: r.sharedAt,
    content: cleanContent(decryptJson<SummaryContent>(r.contentEnc)),
    aiDraft: r.aiDraftEnc ? cleanDemoText(decrypt(r.aiDraftEnc)) : null,
    aiDraftStatus: r.aiDraftStatus,
    reviewedAt: r.reviewedAt,
    correctedDraft: cleanDemoText(decryptOptional(r.correctedDraftEnc)),
    reviewNote: cleanDemoText(decryptOptional(r.reviewNoteEnc)),
  }));
}

function cleanContent(c: SummaryContent): SummaryContent {
  const x = c as SummaryContent & { patientNote?: string | null };
  return "patientNote" in x ? { ...x, patientNote: cleanDemoText(x.patientNote ?? null) } : c;
}

/**
 * Clinician decision on the AI draft: approve, correct (the original is kept), reject, or the
 * legacy "reviewed" acknowledgement. Only the clinician the summary was shared with, while the
 * patient's consent is active. Every decision is audited.
 */
export async function reviewDraft(
  actor: Actor,
  summaryId: string,
  input: { decision: "APPROVED" | "CORRECTED" | "REJECTED" | "REVIEWED"; correctedText?: string | null; note?: string | null } = { decision: "REVIEWED" },
) {
  const s = await prisma.clinicalSummary.findUnique({ where: { id: summaryId } });
  if (!s || s.status !== "SHARED") throw notFound("Summary not found");
  const { clinicianId } = await requireClinicianAccess(actor, s.patientId, "REVIEW_AI_DRAFT");
  if (s.clinicianId !== clinicianId) throw new AppError("FORBIDDEN", "This summary was not shared with you");
  if (!s.aiDraftEnc) throw new AppError("VALIDATION", "There is no AI draft to review");
  await audit(actor, { action: `REVIEW_AI_DRAFT_${input.decision}`, resourceType: "ClinicalSummary", resourceId: summaryId, subjectPatientId: s.patientId });
  return prisma.clinicalSummary.update({
    where: { id: summaryId },
    data: {
      aiDraftStatus: input.decision,
      reviewedAt: new Date(),
      reviewedByUserId: actor.userId,
      ...(input.decision === "CORRECTED" && input.correctedText ? { correctedDraftEnc: encrypt(input.correctedText) } : {}),
      ...(input.note ? { reviewNoteEnc: encrypt(input.note) } : {}),
    },
    select: { id: true, aiDraftStatus: true, reviewedAt: true },
  });
}

/**
 * Clinician asks for a fresh AI draft from the SAME patient-approved snapshot (e.g. after the
 * drafting format improved). Never uses conversations. The new draft starts unverified again;
 * the previous decision stays in the audit log.
 */
export async function regenerateDraft(actor: Actor, summaryId: string) {
  const s = await prisma.clinicalSummary.findUnique({ where: { id: summaryId } });
  if (!s || s.status !== "SHARED") throw notFound("Summary not found");
  const { clinicianId } = await requireClinicianAccess(actor, s.patientId, "REGENERATE_AI_DRAFT");
  if (s.clinicianId !== clinicianId) throw new AppError("FORBIDDEN", "This summary was not shared with you");
  const draft = await generateAiDraft(decryptJson<SummaryContent>(s.contentEnc));
  if (!draft) throw new AppError("VALIDATION", "The AI service could not produce a grounded draft right now");
  await audit(actor, { action: "REGENERATE_AI_DRAFT", resourceType: "ClinicalSummary", resourceId: summaryId, subjectPatientId: s.patientId });
  await prisma.clinicalSummary.update({
    where: { id: summaryId },
    data: { aiDraftEnc: encrypt(draft.text), aiDraftStatus: "UNVERIFIED", reviewedAt: null, reviewedByUserId: null, correctedDraftEnc: null, reviewNoteEnc: null },
  });
  return { id: summaryId, regenerated: true };
}

/** Back-compat wrapper: "I have reviewed this draft". */
export async function markDraftReviewed(actor: Actor, summaryId: string) {
  return reviewDraft(actor, summaryId, { decision: "REVIEWED" });
}

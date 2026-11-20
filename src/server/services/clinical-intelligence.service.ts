import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { decrypt, decryptOptional, encrypt, encryptJson, decryptJson } from "@/lib/crypto";
import { AppError, notFound } from "@/lib/errors";
import { getEnv } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import type { Actor } from "@/lib/auth/session";
import { POLICY_VERSION } from "@/features/consent/policy";
import { getChatProvider } from "@/features/ai/provider-factory";
import { computeWho5Trend, summariseCheckIns } from "@/features/assessments/trends";
import {
  CI_SYSTEM_PROMPT,
  ITEM_SECTIONS,
  PROCESSING_VERSION,
  buildCiInput,
  compareCategories,
  groundInsight,
  itemCount,
  parseModelOutput,
  type InsightContent,
  type SourceMessage,
} from "@/features/clinical-intelligence/engine";
import { audit, recordSystemEvent } from "./audit.service";
import { requireAssignment, requireClinicianAccess } from "./access.service";

/**
 * Clinical Intelligence: with the patient's explicit CLINICAL_INTELLIGENCE consent, Sakinah
 * organises what the patient reported (only messages sent AFTER consent) into a grounded,
 * preliminary, non-diagnostic snapshot the patient reviews. Sharing with a clinician needs a
 * separate sharing consent (category CLINICAL_INSIGHTS) and patient approval of the snapshot.
 * Never part of the crisis path; failures never affect chat.
 */

const MAX_MESSAGES = 60;
const MAX_CHARS = 12_000;
export const SHARE_CATEGORY = "CLINICAL_INSIGHTS";

export const isEnabled = () => getEnv().CLINICAL_INTELLIGENCE_ENABLED === "true";

async function activeConsent(patientId: string, scope: "CLINICAL_INTELLIGENCE" | "CARE_PLAN_SUPPORT") {
  return prisma.consentRecord.findFirst({ where: { patientId, scope, revokedAt: null }, orderBy: { grantedAt: "desc" } });
}

export async function setConsent(actor: Actor, patientId: string, scope: "CLINICAL_INTELLIGENCE" | "CARE_PLAN_SUPPORT", on: boolean) {
  if (!isEnabled()) throw new AppError("UNAVAILABLE", "Clinical Intelligence is not available right now.");
  const current = await activeConsent(patientId, scope);
  if (on && !current) {
    const c = await prisma.consentRecord.create({ data: { patientId, scope, categories: [], policyVersion: POLICY_VERSION } });
    await audit(actor, { action: `CONSENT_GRANTED_${scope}`, resourceType: "ConsentRecord", resourceId: c.id, subjectPatientId: patientId });
  }
  if (!on && current) {
    await prisma.consentRecord.updateMany({ where: { patientId, scope, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(actor, { action: `CONSENT_REVOKED_${scope}`, resourceType: "ConsentRecord", resourceId: current.id, subjectPatientId: patientId });
  }
  return getPatientInsights(actor, patientId, { audited: false });
}

function hashInputs(parts: string[]) {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

/** Patient's own messages sent after consent, newest first, bounded. Ephemeral chats excluded. */
async function sourceMessages(patientId: string, since: Date): Promise<SourceMessage[]> {
  const rows = await prisma.chatMessage.findMany({
    where: { role: "USER", createdAt: { gte: since }, conversation: { patientId, ephemeral: false } },
    orderBy: { createdAt: "desc" },
    take: MAX_MESSAGES,
    select: { id: true, conversationId: true, createdAt: true, contentEnc: true },
  });
  const out: SourceMessage[] = [];
  let chars = 0;
  for (const r of rows) {
    const text = decrypt(r.contentEnc);
    if (chars + text.length > MAX_CHARS) break;
    chars += text.length;
    out.push({ ref: "", messageId: r.id, conversationId: r.conversationId, createdAt: r.createdAt, text });
  }
  return out.reverse().map((m, i) => ({ ...m, ref: `M${i + 1}` }));
}

async function measured(patientId: string) {
  const [who5, checkIns, goals] = await Promise.all([
    prisma.wellbeingAssessment.findMany({ where: { patientId }, orderBy: { completedAt: "asc" }, select: { id: true, percentScore: true, completedAt: true } }),
    prisma.wellbeingCheckIn.findMany({ where: { patientId, createdAt: { gte: new Date(Date.now() - 60 * 86_400_000) } }, orderBy: { createdAt: "asc" } }),
    prisma.wellbeingGoal.findMany({ where: { patientId }, orderBy: { createdAt: "asc" } }),
  ]);
  const trend = who5.length ? computeWho5Trend(who5) : null;
  const ci = checkIns.length
    ? summariseCheckIns(checkIns.map((c) => ({ mood: c.mood ?? 0, stress: c.stress, sleepQuality: c.sleepQuality, functioning: c.functioning, createdAt: c.createdAt })))
    : null;
  return {
    who5,
    checkIns,
    trend,
    checkInSummary: ci,
    goals: goals.map((g) => ({ id: g.id, title: g.title, status: g.status, source: g.source, authorName: g.authorName, updatedAt: g.updatedAt })),
    who5Text: who5.length ? `WHO-5 percentage scores (oldest→newest): ${who5.map((w) => `${w.completedAt.toISOString().slice(0, 10)}: ${w.percentScore}`).join(", ")}` : null,
    checkInText: ci
      ? `Self-reported check-ins (1–5), last 7 days vs prior 7: mood ${ci.mood.recent ?? "–"} vs ${ci.mood.prior ?? "–"}; sleep ${ci.sleepQuality.recent ?? "–"} vs ${ci.sleepQuality.prior ?? "–"}; stress ${ci.stress.recent ?? "–"} vs ${ci.stress.prior ?? "–"}; functioning ${ci.functioning.recent ?? "–"} vs ${ci.functioning.prior ?? "–"}`
      : null,
  };
}

export type AnalysisResult = { status: "DISABLED" | "NO_CONSENT" | "AI_UNAVAILABLE" | "NO_DATA" | "UNCHANGED" | "RATE_LIMITED" | "FAILED" | "CREATED"; insightId?: string };

/**
 * Runs one analysis. Idempotent: identical inputs (same messages, assessments, check-ins) are
 * never re-analysed. Event-driven (after chats) or on request; never part of the crisis path.
 */
const inflight = new Map<string, Promise<AnalysisResult>>();

/** One analysis at a time per patient (a chat-triggered run and a manual "Update" never race). */
export async function analyze(patientId: string, opts: { trigger: "chat" | "manual" | "demo" } = { trigger: "manual" }): Promise<AnalysisResult> {
  const prior = inflight.get(patientId);
  if (prior) await prior.catch(() => null);
  const run = analyzeOnce(patientId, opts);
  inflight.set(patientId, run);
  try {
    return await run;
  } finally {
    if (inflight.get(patientId) === run) inflight.delete(patientId);
  }
}

/** Test/ops helper: wait for background analyses to finish. */
export async function settleAnalyses() {
  await Promise.all([...inflight.values()].map((p) => p.catch(() => null)));
}

async function analyzeOnce(patientId: string, opts: { trigger: "chat" | "manual" | "demo" }): Promise<AnalysisResult> {
  if (!isEnabled()) return { status: "DISABLED" };
  const consent = await activeConsent(patientId, "CLINICAL_INTELLIGENCE");
  if (!consent) return { status: "NO_CONSENT" };
  const provider = getChatProvider();
  if (!provider.isGenerative) return { status: "AI_UNAVAILABLE" };

  const messages = await sourceMessages(patientId, consent.grantedAt);
  if (!messages.length) return { status: "NO_DATA" };
  const m = await measured(patientId);
  const inputHash = hashInputs([
    PROCESSING_VERSION,
    consent.id,
    ...messages.map((x) => x.messageId),
    ...m.who5.map((w) => w.id),
    ...m.checkIns.map((c) => c.id),
  ]);
  const existing = await prisma.clinicalInsight.findUnique({ where: { patientId_inputHash: { patientId, inputHash } } });
  if (existing) return { status: "UNCHANGED", insightId: existing.id };
  if (!rateLimit(`ci-${opts.trigger}:${patientId}`, opts.trigger === "chat" ? 1 : 3, opts.trigger === "chat" ? 120_000 : 60_000)) return { status: "RATE_LIMITED" };
  if (!rateLimit(`ci-day:${patientId}`, 40, 86_400_000)) return { status: "RATE_LIMITED" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(getEnv().LLM_TIMEOUT_MS, 45_000));
  try {
    const raw = await provider.complete({
      system: CI_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildCiInput(messages, { who5: m.who5Text, checkIns: m.checkInText }) }],
      signal: controller.signal,
      maxTokens: 3000,
    });
    const parsed = parseModelOutput(raw);
    if (!parsed) {
      await recordSystemEvent("CI_ANALYSIS", "MALFORMED_OUTPUT");
      return { status: "FAILED" };
    }
    const content = groundInsight(parsed, messages, { who5: !!m.who5Text, checkIns: !!m.checkInText });
    if (content.removed) await recordSystemEvent("CI_GROUNDING_REMOVED", String(content.removed));
    if (!itemCount(content)) return { status: "NO_DATA" };
    const sources = {
      messages: messages.length,
      conversations: new Set(messages.map((x) => x.conversationId)).size,
      from: messages[0].createdAt.toISOString(),
      to: messages[messages.length - 1].createdAt.toISOString(),
      who5Count: m.who5.length,
      checkInCount: m.checkIns.length,
      consentSince: consent.grantedAt.toISOString(),
    };
    const created = await prisma.clinicalInsight.upsert({
      where: { patientId_inputHash: { patientId, inputHash } },
      create: { patientId, consentId: consent.id, inputHash, contentEnc: encryptJson({ ...content, sources }), model: `${provider.id}:${provider.model}`, processingVersion: PROCESSING_VERSION },
      update: {},
    });
    await audit(null, { action: "CLINICAL_INTELLIGENCE_ANALYSIS", resourceType: "ClinicalInsight", resourceId: created.id, subjectPatientId: patientId });
    return { status: "CREATED", insightId: created.id };
  } catch {
    await recordSystemEvent("CI_ANALYSIS", "PROVIDER_ERROR");
    return { status: "FAILED" };
  } finally {
    clearTimeout(timer);
  }
}

/** Fire-and-forget after an ordinary (non-crisis) chat turn. Never throws, never delays chat. */
export function analyzeAfterChat(patientId: string) {
  if (!isEnabled()) return;
  void analyze(patientId, { trigger: "chat" }).catch(() => null);
}

type StoredContent = InsightContent & { sources: Record<string, string | number> };
const decode = (r: { contentEnc: string }) => decryptJson<StoredContent>(r.contentEnc);

/** Removes items the patient excluded. */
function applyPatientEdits(c: StoredContent, removed: string[]): StoredContent {
  const rm = new Set(removed);
  return {
    ...c,
    sections: Object.fromEntries(ITEM_SECTIONS.map((k) => [k, c.sections[k].filter((i) => !rm.has(i.id))])) as StoredContent["sections"],
    possibleConsiderations: c.possibleConsiderations.filter((i) => !rm.has(i.id)),
  };
}

function wellbeingView(m: Awaited<ReturnType<typeof measured>>) {
  return {
    who5: m.who5.map((w) => ({ date: w.completedAt, percentScore: w.percentScore })),
    who5Trend: m.trend ? { direction: m.trend.direction, explanations: m.trend.explanations, suggestProfessionalFollowUp: m.trend.suggestProfessionalFollowUp } : null,
    checkIns: m.checkInSummary,
    goals: m.goals,
  };
}

export async function getPatientInsights(actor: Actor, patientId: string, opts: { audited?: boolean } = {}) {
  const [consent, carePlanConsent, rows, m] = await Promise.all([
    activeConsent(patientId, "CLINICAL_INTELLIGENCE"),
    activeConsent(patientId, "CARE_PLAN_SUPPORT"),
    prisma.clinicalInsight.findMany({ where: { patientId }, orderBy: { createdAt: "desc" }, take: 10 }),
    measured(patientId),
  ]);
  if (opts.audited !== false) await audit(actor, { action: "VIEW_OWN_CLINICAL_INSIGHTS", resourceType: "ClinicalInsight", subjectPatientId: patientId });
  const latest = rows[0] ?? null;
  const previous = rows[1] ?? null;
  const content = latest ? decode(latest) : null;
  return {
    enabled: isEnabled(),
    aiAvailable: getChatProvider().isGenerative,
    consent: consent ? { since: consent.grantedAt } : null,
    carePlanConsent: carePlanConsent ? { since: carePlanConsent.grantedAt } : null,
    latest: latest && content
      ? {
          id: latest.id,
          createdAt: latest.createdAt,
          patientStatus: latest.patientStatus,
          approvedAt: latest.approvedAt,
          clinicianStatus: latest.clinicianStatus,
          removedItemIds: latest.removedItemIds,
          patientNote: decryptOptional(latest.patientNoteEnc),
          content,
          changes: compareCategories(previous ? decode(previous) : null, content),
        }
      : null,
    history: rows.map((r) => ({ id: r.id, createdAt: r.createdAt, patientStatus: r.patientStatus })),
    wellbeing: wellbeingView(m),
  };
}

/** Patient review: remove items, add a correction note, approve for sharing. */
export async function patientReview(actor: Actor, patientId: string, insightId: string, input: { removeItemIds?: string[]; note?: string | null; approve?: boolean }) {
  const row = await prisma.clinicalInsight.findFirst({ where: { id: insightId, patientId } });
  if (!row) throw notFound("Insight not found");
  const removed = [...new Set([...row.removedItemIds, ...(input.removeItemIds ?? [])])].slice(0, 100);
  await prisma.clinicalInsight.update({
    where: { id: row.id },
    data: {
      removedItemIds: removed,
      ...(input.note !== undefined ? { patientNoteEnc: input.note ? encrypt(input.note) : null } : {}),
      ...(input.approve ? { patientStatus: "APPROVED", approvedAt: new Date() } : input.removeItemIds?.length || input.note !== undefined ? { patientStatus: "DRAFT", approvedAt: null } : {}),
    },
  });
  await audit(actor, { action: input.approve ? "CLINICAL_INSIGHT_APPROVED_BY_PATIENT" : "CLINICAL_INSIGHT_CORRECTED_BY_PATIENT", resourceType: "ClinicalInsight", resourceId: row.id, subjectPatientId: patientId });
  return getPatientInsights(actor, patientId, { audited: false });
}

/** Patient deletes all derived insights (their underlying messages are unaffected). */
export async function deleteInsights(actor: Actor, patientId: string) {
  const r = await prisma.clinicalInsight.deleteMany({ where: { patientId } });
  await audit(actor, { action: "CLINICAL_INSIGHTS_DELETED", resourceType: "ClinicalInsight", subjectPatientId: patientId });
  return { deleted: r.count };
}

/**
 * Clinician view: ONLY the latest patient-APPROVED snapshot, and only when the patient shared
 * the CLINICAL_INSIGHTS category with this clinician (active assignment + consent, audited).
 */
export async function getSharedInsightForClinician(actor: Actor, patientId: string) {
  const grant = await requireClinicianAccess(actor, patientId, "VIEW_SHARED_CLINICAL_INSIGHTS");
  if (!grant.categories.includes(SHARE_CATEGORY)) return null;
  const rows = await prisma.clinicalInsight.findMany({ where: { patientId, patientStatus: "APPROVED" }, orderBy: { createdAt: "desc" }, take: 2 });
  if (!rows.length) return { latest: null, changes: null, wellbeing: wellbeingView(await measured(patientId)) };
  const [cur, prev] = rows;
  const content = applyPatientEdits(decode(cur), cur.removedItemIds);
  const prevContent = prev ? applyPatientEdits(decode(prev), prev.removedItemIds) : null;
  return {
    latest: {
      id: cur.id,
      createdAt: cur.createdAt,
      approvedAt: cur.approvedAt,
      patientNote: decryptOptional(cur.patientNoteEnc),
      clinicianStatus: cur.clinicianStatus,
      clinicianNote: decryptOptional(cur.clinicianNoteEnc),
      reviewedAt: cur.reviewedAt,
      content,
    },
    previousApprovedAt: prev?.approvedAt ?? null,
    changes: compareCategories(prevContent, content),
    wellbeing: wellbeingView(await measured(patientId)),
  };
}

export async function clinicianReview(actor: Actor, insightId: string, input: { decision: "APPROVED" | "CORRECTED" | "REJECTED"; note?: string | null }) {
  const row = await prisma.clinicalInsight.findUnique({ where: { id: insightId } });
  if (!row || row.patientStatus !== "APPROVED") throw notFound("Insight not found");
  const grant = await requireClinicianAccess(actor, row.patientId, "REVIEW_CLINICAL_INSIGHT");
  if (!grant.categories.includes(SHARE_CATEGORY)) throw new AppError("FORBIDDEN", "The patient has not shared their Clinical Insights with you");
  if (input.decision === "CORRECTED" && !input.note?.trim()) throw new AppError("VALIDATION", "Describe the correction");
  await prisma.clinicalInsight.update({
    where: { id: row.id },
    data: { clinicianStatus: input.decision, clinicianNoteEnc: input.note ? encrypt(input.note) : null, reviewedByUserId: actor.userId, reviewedAt: new Date() },
  });
  await audit(actor, { action: `CLINICAL_INSIGHT_${input.decision}`, resourceType: "ClinicalInsight", resourceId: row.id, subjectPatientId: row.patientId });
  return { id: row.id, clinicianStatus: input.decision };
}

/** Clinician adds a patient-facing follow-up goal (assigned clinicians only). Visible to the patient. */
export async function addClinicianGoal(actor: Actor, patientId: string, title: string) {
  const clinicianId = await requireAssignment(actor, patientId, "ADD_CLINICIAN_GOAL");
  const goal = await prisma.wellbeingGoal.create({ data: { patientId, title: title.trim(), source: "CLINICIAN", clinicianId, authorName: actor.displayName } });
  await audit(actor, { action: "ADD_CLINICIAN_GOAL", resourceType: "WellbeingGoal", resourceId: goal.id, subjectPatientId: patientId });
  return { id: goal.id, title: goal.title };
}

/**
 * Clinician follow-up goals Sakinah may gently use — only with CARE_PLAN_SUPPORT consent.
 * Titles only: never clinician notes, diagnoses or medication.
 */
export async function careGoalsForSakinah(patientId: string): Promise<string[]> {
  if (!isEnabled()) return [];
  if (!(await activeConsent(patientId, "CARE_PLAN_SUPPORT"))) return [];
  const goals = await prisma.wellbeingGoal.findMany({ where: { patientId, source: "CLINICIAN", status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 5 });
  return goals.map((g) => `${g.title}${g.authorName ? ` (agreed with ${g.authorName})` : ""}`);
}

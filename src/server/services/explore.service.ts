import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";
import { getEnv } from "@/lib/env";
import type { Actor } from "@/lib/auth/session";
import type { z } from "zod";
import type { ExploreSchema } from "@/lib/validation/schemas";
import { CONCERN_AREAS, CONCERN_DURATION, CONCERN_FREQUENCY, CONCERN_IMPACT, HELP_WANTED } from "@/features/consent/policy";
import { computeWho5Trend, summariseCheckIns } from "@/features/assessments/trends";
import { describeWellbeing } from "@/features/assessments/wellbeing-summary";
import { assessMessage } from "@/features/safety/classifier";
import { elevatedConcernFallback, immediateDangerResponse } from "@/features/safety/responses";
import { EXPLORE_LABEL, EXPLORE_SYSTEM_PROMPT, groundExplore } from "@/features/ai/explore";
import { getChatProvider } from "@/features/ai/provider-factory";
import { audit, recordSystemEvent } from "./audit.service";
import { hasAiProcessingConsent } from "./consent.service";
import { listCheckIns } from "./wellbeing.service";

type ExploreInput = z.infer<typeof ExploreSchema>;

const SLEEP = { GOOD: "Sleeping fairly well", OK: "Sleep is so-so", POOR: "Sleeping poorly" } as const;
const STRESS = { LOW: "Low stress", MEDIUM: "Moderate stress", HIGH: "High stress" } as const;

/**
 * AI-assisted, PRELIMINARY and non-diagnostic exploration for the patient themselves. Uses only
 * their own answers, optional words, WHO-5 and check-ins. Nothing from it is stored; the audit
 * entry contains no content. Free text is checked by the Safety Guardian before any AI call.
 */
export async function exploreWellbeing(actor: Actor & { patientId: string }, input: ExploreInput) {
  const patientId = actor.patientId;
  if (!(await hasAiProcessingConsent(patientId))) throw new AppError("CONSENT_REQUIRED", "Sakinah needs your AI-processing consent (Profile & Privacy).");

  if (input.ownWords) {
    const a = assessMessage(input.ownWords);
    if (a.level === "IMMEDIATE_DANGER") return { kind: "safety" as const, level: a.level, text: immediateDangerResponse(a) };
    if (a.level === "ELEVATED_CONCERN") return { kind: "safety" as const, level: a.level, text: elevatedConcernFallback(a) };
  }

  const [assessments, checkIns] = await Promise.all([
    prisma.wellbeingAssessment.findMany({ where: { patientId }, orderBy: { completedAt: "asc" }, select: { percentScore: true, completedAt: true } }),
    listCheckIns(patientId, 30),
  ]);
  const trend = computeWho5Trend(assessments);
  const ci = summariseCheckIns(checkIns);
  const answers = {
    areas: input.areas.map((x) => CONCERN_AREAS[x]),
    duration: CONCERN_DURATION[input.duration],
    frequency: CONCERN_FREQUENCY[input.frequency],
    dailyLifeImpact: CONCERN_IMPACT[input.dailyLifeImpact],
    helpWanted: input.helpWanted ? HELP_WANTED[input.helpWanted] : null,
    sleep: SLEEP[input.sleep],
    stress: STRESS[input.stress],
  };
  const unclear = [
    ...(assessments.length === 0 ? ["You haven't completed a WHO-5 wellbeing check yet."] : assessments.length === 1 ? ["Only one WHO-5 result, so no trend yet."] : []),
    ...(ci.recentCount < 3 ? ["Few daily check-ins in the last week."] : []),
    "These are your own answers; only a qualified professional can assess what they mean for you.",
  ];
  const deterministic = describeWellbeing(trend, ci);
  await audit(actor, { action: "EXPLORE_WELLBEING_RUN", resourceType: "Patient", resourceId: patientId, subjectPatientId: patientId });

  const provider = getChatProvider();
  if (!provider.isGenerative) return { kind: "summary" as const, label: EXPLORE_LABEL, ai: null, answers, unclear, wellbeing: deterministic };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), getEnv().LLM_TIMEOUT_MS);
  try {
    const data = {
      yourAnswers: answers,
      yourWords: input.ownWords || null,
      who5: assessments.length ? assessments.map((a) => ({ date: a.completedAt.toISOString().slice(0, 10), percentScore: a.percentScore })) : null,
      who5Notes: assessments.length ? trend.explanations : null,
      checkInsLast7Days: ci.recentCount ? { mood: ci.mood, stress: ci.stress, sleepQuality: ci.sleepQuality, functioning: ci.functioning, count: ci.recentCount } : null,
    };
    const raw = await provider.complete({ system: EXPLORE_SYSTEM_PROMPT, messages: [{ role: "user", content: JSON.stringify(data) }], signal: controller.signal, maxTokens: 2500 });
    const g = groundExplore(raw, { who5: assessments.length > 0, checkIns: ci.recentCount > 0, ownWords: !!input.ownWords });
    if (g.removed) await recordSystemEvent("AI_DRAFT_FILTERED", `${g.removed}`);
    return { kind: "summary" as const, label: EXPLORE_LABEL, ai: g.text, answers, unclear, wellbeing: deterministic };
  } catch {
    await recordSystemEvent("LLM_ERROR", "EXPLORE_FAILED");
    return { kind: "summary" as const, label: EXPLORE_LABEL, ai: null, answers, unclear, wellbeing: deterministic };
  } finally {
    clearTimeout(timer);
  }
}

import { prisma } from "@/lib/db/prisma";
import type { Actor } from "@/lib/auth/session";
import { isConfirmedHandoff, type ReferralStatus } from "@/features/referrals/state-machine";
import { audit } from "./audit.service";

/** Minimum group size before an aggregate is displayed (small-cell suppression). */
export const MIN_CELL_SIZE = 10;

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Outcome & safety metrics. Wellbeing aggregates include ONLY patients with an active
 * AGGREGATE_ANALYTICS consent. Operational/safety counts contain no personal content.
 * In the hackathon deployment all underlying records are synthetic.
 */
export async function getOutcomeMetrics(actor: Actor) {
  await audit(actor, { action: "VIEW_OUTCOME_METRICS", resourceType: "Analytics" });
  const consenting = await prisma.consentRecord.findMany({
    where: { scope: "AGGREGATE_ANALYTICS", revokedAt: null },
    select: { patientId: true },
    distinct: ["patientId"],
  });
  const cohort = consenting.map((c) => c.patientId);
  const since = new Date(Date.now() - 90 * 86_400_000);

  const [checkIns, assessments, referrals, followUps, safetyEvents, systemEvents] = await Promise.all([
    prisma.wellbeingCheckIn.count({ where: { patientId: { in: cohort }, createdAt: { gte: since } } }),
    prisma.wellbeingAssessment.findMany({
      where: { patientId: { in: cohort }, completedAt: { gte: since } },
      select: { percentScore: true, completedAt: true },
    }),
    prisma.careReferral.findMany({ select: { status: true, requestedAt: true, firstContactAt: true } }),
    prisma.followUp.findMany({ select: { status: true, functioningChange: true } }),
    prisma.safetyEvent.findMany({ select: { level: true, workflowStatus: true, simulatedAlertAt: true, acknowledgedAt: true } }),
    prisma.systemEvent.groupBy({ by: ["kind", "code"], _count: true }),
  ]);

  // WHO-5 monthly averages (cohort only), suppressed when n < MIN_CELL_SIZE
  const byMonth = new Map<string, number[]>();
  for (const a of assessments) {
    const key = a.completedAt.toISOString().slice(0, 7);
    byMonth.set(key, [...(byMonth.get(key) ?? []), a.percentScore]);
  }
  const who5Monthly = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      n: v.length,
      average: v.length >= MIN_CELL_SIZE ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null,
    }));

  const hoursToFirstContact = referrals
    .filter((r) => r.firstContactAt)
    .map((r) => (r.firstContactAt!.getTime() - r.requestedAt.getTime()) / 3_600_000);

  const completedFollowUps = followUps.filter((f) => f.status === "COMPLETED");
  const closedFollowUps = followUps.filter((f) => f.status !== "PLANNED");
  const functioningChanges = completedFollowUps.map((f) => f.functioningChange).filter((x): x is number => x !== null);

  const sysCount = (kind: string, code?: string) =>
    systemEvents.filter((e) => e.kind === kind && (!code || e.code === code)).reduce((s, e) => s + e._count, 0);

  const alertsSent = safetyEvents.filter((e) => e.simulatedAlertAt).length;
  const alertsAcked = safetyEvents.filter((e) => e.acknowledgedAt).length;

  return {
    cohortSize: cohort.length,
    checkInsLast90Days: checkIns,
    assessmentsLast90Days: assessments.length,
    who5Monthly,
    referrals: {
      requested: referrals.length,
      confirmedHandoffs: referrals.filter((r) => isConfirmedHandoff(r.status as ReferralStatus)).length,
      byStatus: referrals.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {}),
      medianHoursToFirstContact: median(hoursToFirstContact),
    },
    followUps: {
      total: followUps.length,
      completed: completedFollowUps.length,
      completionRate: closedFollowUps.length ? completedFollowUps.length / closedFollowUps.length : null,
      averageFunctioningChange: functioningChanges.length
        ? Math.round((functioningChanges.reduce((s, x) => s + x, 0) / functioningChanges.length) * 100) / 100
        : null,
    },
    safety: {
      immediateDangerPathways: safetyEvents.filter((e) => e.level === "IMMEDIATE_DANGER").length,
      elevatedConcernPathways: safetyEvents.filter((e) => e.level === "ELEVATED_CONCERN").length,
      simulatedAlertsSent: alertsSent,
      simulatedAlertsAcknowledged: alertsAcked,
      handoffFailures: safetyEvents.filter((e) => e.workflowStatus === "HANDOFF_FAILED").length,
      helpPageOpens: sysCount("CRISIS_WORKFLOW", "HELP_OPENED"),
      emergencyCallTaps: sysCount("CRISIS_WORKFLOW", "CALL_TAPPED"),
    },
    system: {
      llmErrors: sysCount("LLM_ERROR"),
      outputGuardInterventions: sysCount("OUTPUT_GUARD"),
      handoffFailures: sysCount("HANDOFF_FAILED"),
    },
    fairness: SYNTHETIC_FAIRNESS,
  };
}

/**
 * Fairness monitoring FRAMEWORK, demonstrated with SYNTHETIC aggregated data only.
 * The production design computes these from opt-in, coarse demographic bands
 * (no exact age, no free-text nationality) with small-cell suppression, and flags any
 * group whose rate differs from the overall rate by more than 10 percentage points.
 */
export const SYNTHETIC_FAIRNESS = {
  isSynthetic: true as const,
  overall: { referralCompletion: 0.62, crisisWorkflowCompletion: 0.91, followUpCompletion: 0.74 },
  dimensions: [
    {
      dimension: "Age band",
      groups: [
        { group: "18–24", n: 148, referralCompletion: 0.51, crisisWorkflowCompletion: 0.88, followUpCompletion: 0.66 },
        { group: "25–44", n: 412, referralCompletion: 0.65, crisisWorkflowCompletion: 0.92, followUpCompletion: 0.77 },
        { group: "45–64", n: 201, referralCompletion: 0.66, crisisWorkflowCompletion: 0.93, followUpCompletion: 0.76 },
        { group: "65+", n: 7, referralCompletion: null, crisisWorkflowCompletion: null, followUpCompletion: null },
      ],
    },
    {
      dimension: "Preferred language",
      groups: [
        { group: "Arabic", n: 289, referralCompletion: 0.6, crisisWorkflowCompletion: 0.9, followUpCompletion: 0.73 },
        { group: "English", n: 432, referralCompletion: 0.64, crisisWorkflowCompletion: 0.92, followUpCompletion: 0.75 },
        { group: "Other", n: 47, referralCompletion: 0.49, crisisWorkflowCompletion: 0.87, followUpCompletion: 0.68 },
      ],
    },
    {
      dimension: "Nationality group",
      groups: [
        { group: "UAE national", n: 214, referralCompletion: 0.63, crisisWorkflowCompletion: 0.92, followUpCompletion: 0.75 },
        { group: "Expatriate", n: 531, referralCompletion: 0.62, crisisWorkflowCompletion: 0.91, followUpCompletion: 0.74 },
        { group: "Prefer not to say", n: 23, referralCompletion: 0.57, crisisWorkflowCompletion: 0.9, followUpCompletion: 0.7 },
      ],
    },
    {
      dimension: "Region",
      groups: [
        { group: "Abu Dhabi city", n: 498, referralCompletion: 0.66, crisisWorkflowCompletion: 0.92, followUpCompletion: 0.76 },
        { group: "Al Ain", n: 187, referralCompletion: 0.58, crisisWorkflowCompletion: 0.9, followUpCompletion: 0.71 },
        { group: "Al Dhafra", n: 83, referralCompletion: 0.47, crisisWorkflowCompletion: 0.86, followUpCompletion: 0.64 },
      ],
    },
  ],
};

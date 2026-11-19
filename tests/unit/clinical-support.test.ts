import { describe, expect, it } from "vitest";
import { computeWho5Trend } from "@/features/assessments/trends";
import { describeWellbeing, type CheckInSummary } from "@/features/assessments/wellbeing-summary";
import { ClinicianFindingSchema, DraftReviewSchema, ReferralCreateSchema, SummaryPreviewSchema } from "@/lib/validation/schemas";
import { AI_SUMMARY_LABEL, CLINICIAN_SUMMARY_SYSTEM_PROMPT } from "@/features/ai/prompts";

const day = 86_400_000;
const who5 = (...scores: number[]) => computeWho5Trend(scores.map((s, i) => ({ percentScore: s, completedAt: new Date(Date.now() - (scores.length - i) * 14 * day) })));
const checkIns = (o: Partial<CheckInSummary> = {}): CheckInSummary => ({
  recentCount: 5,
  mood: { recent: 3.5, prior: 3.5 },
  stress: { recent: 2, prior: 2 },
  sleepQuality: { recent: 3.5, prior: 3.5 },
  functioning: { recent: 3.5, prior: 3.5 },
  ...o,
});
const DIAGNOSTIC = /depress(ion|ed)|anxiety disorder|disorder|diagnos(is|ed) (of|with)|you have/i;

describe("Patient wellbeing summary (deterministic, non-diagnostic)", () => {
  it("describes ongoing stress and lower wellbeing, suggests professional support, never diagnoses", () => {
    const s = describeWellbeing(who5(72, 64, 52, 44, 36), checkIns({ stress: { recent: 4.2, prior: 3 }, mood: { recent: 2.2, prior: 3 } }));
    expect(s.headline).toBe("Your recent check-ins suggest that you've been experiencing ongoing stress and lower wellbeing.");
    expect(s.suggestProfessional).toBe(true);
    expect(s.disclaimer).toMatch(/not a diagnosis/);
    expect([s.headline, ...s.points].join(" ")).not.toMatch(DIAGNOSTIC);
  });
  it("is steady when results are steady, and honest when there is no data", () => {
    expect(describeWellbeing(who5(68, 70), checkIns()).headline).toMatch(/broadly steady/);
    expect(describeWellbeing(who5(68, 70), checkIns()).suggestProfessional).toBe(false);
    const none = describeWellbeing(who5(), { ...checkIns(), recentCount: 0 });
    expect(none.enoughData).toBe(false);
    expect(none.headline).toMatch(/isn't enough information/);
  });
});

describe("Clinical-support validation", () => {
  const base = { clinicianId: "c1", categories: ["REPORTED_CONCERNS"] };
  it("requires patient-reported concerns when that item is shared", () => {
    expect(SummaryPreviewSchema.safeParse(base).success).toBe(false);
    expect(
      SummaryPreviewSchema.safeParse({ ...base, reportedConcerns: { areas: ["STRESS"], duration: "1_TO_3_MONTHS", frequency: "MOST_DAYS", dailyLifeImpact: "A_LOT" } }).success,
    ).toBe(true);
    expect(SummaryPreviewSchema.safeParse({ ...base, reportedConcerns: { areas: ["MADE_UP"], duration: "1_TO_3_MONTHS", frequency: "MOST_DAYS", dailyLifeImpact: "A_LOT" } }).success).toBe(false);
  });
  it("needs corrected text to record a correction; findings and care types are constrained", () => {
    expect(DraftReviewSchema.safeParse({ decision: "CORRECTED" }).success).toBe(false);
    expect(DraftReviewSchema.parse({})).toMatchObject({ decision: "REVIEWED" });
    expect(ClinicianFindingSchema.safeParse({ kind: "RISK_SCORE", content: "x" }).success).toBe(false);
    expect(ReferralCreateSchema.safeParse({ resourceId: "r", urgency: "ROUTINE", careType: "HOSPITAL" }).success).toBe(false);
  });
  it("labels AI summaries and forbids diagnoses and risk scores in the drafting instructions", () => {
    expect(AI_SUMMARY_LABEL).toBe("Preliminary AI-generated clinical impression — not a confirmed diagnosis. Requires professional assessment.");
    expect(CLINICIAN_SUMMARY_SYSTEM_PROMPT).toContain(AI_SUMMARY_LABEL);
    expect(CLINICIAN_SUMMARY_SYSTEM_PROMPT).toMatch(/Never add facts, causes, diagnoses, diagnostic labels, risk levels or risk scores/);
    expect(CLINICIAN_SUMMARY_SYSTEM_PROMPT).toMatch(/Questions the clinician may wish to explore/);
  });
});

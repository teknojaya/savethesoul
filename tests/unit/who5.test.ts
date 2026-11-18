import { describe, expect, it } from "vitest";
import { describeWho5, scoreWho5, WHO5_ITEMS } from "@/features/assessments/who5";
import { computeWho5Trend, summariseCheckIns } from "@/features/assessments/trends";

describe("WHO-5 scoring", () => {
  it("has exactly five items", () => {
    expect(WHO5_ITEMS).toHaveLength(5);
  });

  it("sums raw score 0–25 and multiplies by 4", () => {
    expect(scoreWho5([5, 5, 5, 5, 5])).toEqual({ ok: true, answers: [5, 5, 5, 5, 5], rawScore: 25, percentScore: 100 });
    expect(scoreWho5([0, 0, 0, 0, 0])).toMatchObject({ rawScore: 0, percentScore: 0 });
    expect(scoreWho5([3, 2, 4, 1, 3])).toMatchObject({ rawScore: 13, percentScore: 52 });
  });

  it("rejects missing answers instead of prorating", () => {
    expect(scoreWho5([3, null, 4, undefined, 3])).toEqual({ ok: false, missingItems: [2, 4], invalidItems: [] });
    expect(scoreWho5([])).toEqual({ ok: false, missingItems: [1, 2, 3, 4, 5], invalidItems: [] });
  });

  it("rejects out-of-range, non-integer and extra answers", () => {
    expect(scoreWho5([6, 0, 0, 0, 0])).toMatchObject({ ok: false, invalidItems: [1] });
    expect(scoreWho5([-1, 0, 0, 0, 0])).toMatchObject({ ok: false, invalidItems: [1] });
    expect(scoreWho5([2.5, 0, 0, 0, 0])).toMatchObject({ ok: false, invalidItems: [1] });
    expect(scoreWho5([1, 1, 1, 1, 1, 1])).toMatchObject({ ok: false, invalidItems: [6] });
  });

  it("describes scores without diagnostic language", () => {
    for (const pct of [0, 28, 50, 52, 68, 72, 100]) {
      const d = describeWho5(pct);
      const text = `${d.headline} ${d.explanation}`.toLowerCase();
      expect(text).not.toMatch(/you have (depression|a disorder)|diagnosed with|suicid/);
    }
    expect(describeWho5(50).suggestProfessional).toBe(true);
    expect(describeWho5(52).suggestProfessional).toBe(false);
    expect(describeWho5(50).explanation).toMatch(/not a diagnosis/i);
  });
});

describe("WHO-5 trend", () => {
  const at = (d: number) => new Date(Date.UTC(2026, 0, 1 + d));

  it("needs at least two points for a direction", () => {
    expect(computeWho5Trend([]).direction).toBe("insufficient-data");
    expect(computeWho5Trend([{ percentScore: 60, completedAt: at(0) }]).direction).toBe("insufficient-data");
  });

  it("flags a meaningful single drop (≥10 points)", () => {
    const t = computeWho5Trend([
      { percentScore: 72, completedAt: at(0) },
      { percentScore: 60, completedAt: at(14) },
    ]);
    expect(t.changeFromPrevious).toBe(-12);
    expect(t.meaningfulChange).toBe(true);
    expect(t.direction).toBe("declining");
    expect(t.suggestProfessionalFollowUp).toBe(false); // 60 is not low and decline is not sustained
  });

  it("detects a sustained decline made of small steps and suggests follow-up", () => {
    const t = computeWho5Trend([
      { percentScore: 56, completedAt: at(0) },
      { percentScore: 48, completedAt: at(14) },
      { percentScore: 40, completedAt: at(28) },
    ]);
    expect(t.consecutiveDeclines).toBe(2);
    expect(t.direction).toBe("declining");
    expect(t.suggestProfessionalFollowUp).toBe(true);
  });

  it("sorts unsorted input by date", () => {
    const t = computeWho5Trend([
      { percentScore: 36, completedAt: at(56) },
      { percentScore: 72, completedAt: at(0) },
      { percentScore: 52, completedAt: at(28) },
    ]);
    expect(t.latest?.percentScore).toBe(36);
    expect(t.changeFromFirst).toBe(-36);
  });

  it("treats small fluctuation as stable and low latest score as follow-up worthy", () => {
    const t = computeWho5Trend([
      { percentScore: 44, completedAt: at(0) },
      { percentScore: 48, completedAt: at(14) },
    ]);
    expect(t.direction).toBe("stable");
    expect(t.latestIsLow).toBe(true);
    expect(t.suggestProfessionalFollowUp).toBe(true);
  });

  it("summarises check-ins by comparing the last 7 days with the week before", () => {
    const now = new Date("2026-03-15T12:00:00Z");
    const day = 86_400_000;
    const s = summariseCheckIns(
      [
        { mood: 2, stress: 4, sleepQuality: null, functioning: 2, createdAt: new Date(now.getTime() - 1 * day) },
        { mood: 4, stress: 2, sleepQuality: 3, functioning: 4, createdAt: new Date(now.getTime() - 3 * day) },
        { mood: 5, stress: 1, sleepQuality: 5, functioning: 5, createdAt: new Date(now.getTime() - 10 * day) },
        { mood: 1, stress: 5, sleepQuality: 1, functioning: 1, createdAt: new Date(now.getTime() - 30 * day) },
      ],
      now,
    );
    expect(s.recentCount).toBe(2);
    expect(s.priorCount).toBe(1);
    expect(s.mood).toEqual({ recent: 3, prior: 5 });
    expect(s.sleepQuality).toEqual({ recent: 3, prior: 5 });
  });
});

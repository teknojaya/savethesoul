import { WHO5_LOW_WELLBEING_THRESHOLD, WHO5_MEANINGFUL_CHANGE } from "./who5";

export interface ScoredPoint {
  percentScore: number;
  completedAt: Date;
}

export interface Who5Trend {
  count: number;
  latest: ScoredPoint | null;
  previous: ScoredPoint | null;
  changeFromPrevious: number | null;
  changeFromFirst: number | null;
  direction: "improving" | "declining" | "stable" | "insufficient-data";
  meaningfulChange: boolean;
  consecutiveDeclines: number;
  latestIsLow: boolean;
  suggestProfessionalFollowUp: boolean;
  explanations: string[];
}

/**
 * Derives a WHO-5 trend from structured assessment history only.
 * It never uses chat content, sentiment, or model output.
 */
export function computeWho5Trend(points: ScoredPoint[]): Who5Trend {
  const sorted = [...points].sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
  const count = sorted.length;
  const latest = sorted[count - 1] ?? null;
  const previous = sorted[count - 2] ?? null;
  const first = sorted[0] ?? null;

  const changeFromPrevious = latest && previous ? latest.percentScore - previous.percentScore : null;
  const changeFromFirst = latest && first && count > 1 ? latest.percentScore - first.percentScore : null;

  let consecutiveDeclines = 0;
  for (let i = count - 1; i > 0; i--) {
    if (sorted[i].percentScore < sorted[i - 1].percentScore) consecutiveDeclines++;
    else break;
  }

  const meaningfulChange =
    changeFromPrevious !== null && Math.abs(changeFromPrevious) >= WHO5_MEANINGFUL_CHANGE;

  // A sustained decline: at least two consecutive drops adding up to a meaningful change.
  const sustainedDecline =
    consecutiveDeclines >= 2 && (changeFromFirst ?? 0) <= -WHO5_MEANINGFUL_CHANGE;

  let direction: Who5Trend["direction"] = "insufficient-data";
  if (changeFromPrevious !== null) {
    if (changeFromPrevious >= WHO5_MEANINGFUL_CHANGE) direction = "improving";
    else if (changeFromPrevious <= -WHO5_MEANINGFUL_CHANGE || sustainedDecline) direction = "declining";
    else direction = "stable";
  }

  const latestIsLow = latest ? latest.percentScore <= WHO5_LOW_WELLBEING_THRESHOLD : false;
  const suggestProfessionalFollowUp = latestIsLow || sustainedDecline;

  const explanations: string[] = [];
  if (count === 0) explanations.push("Complete a WHO-5 check to start seeing your wellbeing over time.");
  if (count === 1) explanations.push("One result so far. Trends become meaningful after a few check-ins spaced about two weeks apart.");
  if (changeFromPrevious !== null) {
    if (meaningfulChange) {
      explanations.push(
        `Your score changed by ${changeFromPrevious > 0 ? "+" : ""}${changeFromPrevious} points since your last check. A change of 10 points or more is generally considered meaningful.`,
      );
    } else {
      explanations.push(
        `Your score changed by ${changeFromPrevious > 0 ? "+" : ""}${changeFromPrevious} points since your last check, which is within the range of normal variation.`,
      );
    }
  }
  if (sustainedDecline) {
    explanations.push(
      `Your score has gone down across ${consecutiveDeclines} check-ins in a row (${changeFromFirst} points overall). A steady decline is a good reason to talk with a professional.`,
    );
  }
  if (latestIsLow) {
    explanations.push(
      "Your latest score is 50 or below. WHO-5 guidance suggests this is a good time to speak with a healthcare professional. This is not a diagnosis.",
    );
  }
  return {
    count,
    latest,
    previous,
    changeFromPrevious,
    changeFromFirst,
    direction,
    meaningfulChange,
    consecutiveDeclines,
    latestIsLow,
    suggestProfessionalFollowUp,
    explanations,
  };
}

export interface CheckInPoint {
  mood: number;
  stress: number | null;
  sleepQuality: number | null;
  functioning: number | null;
  createdAt: Date;
}

function avg(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => typeof x === "number");
  if (!v.length) return null;
  return Math.round((v.reduce((s, n) => s + n, 0) / v.length) * 10) / 10;
}

/** Compares the last 7 days with the 7 days before, from self-reported check-ins only. */
export function summariseCheckIns(points: CheckInPoint[], now = new Date()) {
  const day = 86_400_000;
  const recent = points.filter((p) => now.getTime() - p.createdAt.getTime() <= 7 * day);
  const prior = points.filter((p) => {
    const age = now.getTime() - p.createdAt.getTime();
    return age > 7 * day && age <= 14 * day;
  });
  const fields = ["mood", "stress", "sleepQuality", "functioning"] as const;
  const result = Object.fromEntries(
    fields.map((f) => [
      f,
      { recent: avg(recent.map((p) => p[f])), prior: avg(prior.map((p) => p[f])) },
    ]),
  ) as Record<(typeof fields)[number], { recent: number | null; prior: number | null }>;
  return { recentCount: recent.length, priorCount: prior.length, ...result };
}

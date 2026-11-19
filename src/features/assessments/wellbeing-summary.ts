import type { Who5Trend } from "./trends";

type Avg = { recent: number | null; prior: number | null };
export interface CheckInSummary {
  recentCount: number;
  mood: Avg;
  stress: Avg;
  sleepQuality: Avg;
  functioning: Avg;
}

export interface WellbeingSummary {
  headline: string;
  points: string[];
  suggestProfessional: boolean;
  enoughData: boolean;
  disclaimer: string;
}

export const WELLBEING_SUMMARY_DISCLAIMER =
  "This is not a diagnosis. It is a plain-language summary of what you have recorded in your check-ins and WHO-5 results.";

/**
 * Patient-facing wellbeing summary. Deterministic and rule-based: built ONLY from the patient's
 * own WHO-5 results and check-ins (never chat content, tone, frequency of use or AI output).
 * It describes; it never labels a condition.
 */
export function describeWellbeing(trend: Who5Trend, c: CheckInSummary): WellbeingSummary {
  const points: string[] = [];
  let concerns = 0;
  let stressFlag = false;

  if (trend.count === 0) points.push("You haven't completed a WHO-5 wellbeing check yet.");
  else {
    if (trend.latestIsLow) {
      points.push("Your latest WHO-5 result is in the lower range.");
      concerns++;
    }
    if (trend.direction === "declining" && (trend.meaningfulChange || trend.consecutiveDeclines >= 2)) {
      points.push("Your WHO-5 results have gone down over recent checks.");
      concerns++;
    } else if (trend.direction === "improving") points.push("Your WHO-5 results have gone up recently.");
    else if (trend.direction === "stable") points.push("Your WHO-5 results have been fairly steady.");
  }

  if (c.recentCount === 0) points.push("You haven't checked in during the last 7 days.");
  else {
    if ((c.stress.recent ?? 0) >= 3.5 || (c.stress.recent !== null && c.stress.prior !== null && c.stress.recent - c.stress.prior >= 1)) {
      points.push("Your recent check-ins show higher stress.");
      stressFlag = true;
      concerns++;
    }
    if (c.sleepQuality.recent !== null && c.sleepQuality.recent <= 2.5) {
      points.push("You've rated your sleep as poor recently.");
      concerns++;
    }
    if (c.mood.recent !== null && c.mood.recent <= 2.5) {
      points.push("Your mood has been low in recent check-ins.");
      concerns++;
    }
    if (c.functioning.recent !== null && c.functioning.recent <= 2.5) {
      points.push("Everyday tasks have felt harder recently.");
      concerns++;
    }
  }

  const enoughData = trend.count > 0 || c.recentCount > 0;
  const suggestProfessional = trend.suggestProfessionalFollowUp || concerns >= 2;
  const headline = !enoughData
    ? "There isn't enough information yet for a summary. A check-in or the WHO-5 takes a couple of minutes."
    : suggestProfessional
      ? `Your recent check-ins suggest that you've been experiencing ${stressFlag ? "ongoing stress and " : ""}lower wellbeing.`
      : concerns === 1
        ? "Most of what you've recorded looks steady, with one area that may need some care."
        : "What you've recorded recently looks broadly steady.";
  return { headline, points, suggestProfessional, enoughData, disclaimer: WELLBEING_SUMMARY_DISCLAIMER };
}

/**
 * WHO-5 Well-Being Index (WHO, 1998 version).
 *
 * Five items rated on a 0–5 scale for the last two weeks. The raw score (0–25) is
 * multiplied by 4 to give a percentage score (0–100), where 0 is the worst possible
 * and 100 the best possible quality of life.
 *
 * Reference: Topp CW, Østergaard SD, Søndergaard S, Bech P. "The WHO-5 Well-Being Index:
 * a systematic review of the literature." Psychother Psychosom 2015;84:167–176.
 *
 * The WHO-5 is a screening and monitoring measure. It does NOT diagnose depression or
 * any other condition and does NOT assess suicide risk.
 */

export const WHO5_ITEMS = [
  "I have felt cheerful and in good spirits",
  "I have felt calm and relaxed",
  "I have felt active and vigorous",
  "I woke up feeling fresh and rested",
  "My daily life has been filled with things that interest me",
] as const;

export const WHO5_OPTIONS = [
  { value: 5, label: "All of the time" },
  { value: 4, label: "Most of the time" },
  { value: 3, label: "More than half of the time" },
  { value: 2, label: "Less than half of the time" },
  { value: 1, label: "Some of the time" },
  { value: 0, label: "At no time" },
] as const;

/** Percentage score at or below which published guidance suggests further evaluation. */
export const WHO5_LOW_WELLBEING_THRESHOLD = 50;
/** A change of 10 percentage points is regarded as clinically relevant (Topp et al., 2015). */
export const WHO5_MEANINGFUL_CHANGE = 10;

export type Who5Result =
  | { ok: true; answers: number[]; rawScore: number; percentScore: number }
  | { ok: false; missingItems: number[]; invalidItems: number[] };

/**
 * Scores a WHO-5 response. All five items are required: the published scoring
 * does not support prorating missing answers, so incomplete responses are rejected
 * rather than guessed.
 */
export function scoreWho5(answers: ReadonlyArray<number | null | undefined>): Who5Result {
  const missingItems: number[] = [];
  const invalidItems: number[] = [];
  for (let i = 0; i < WHO5_ITEMS.length; i++) {
    const a = answers[i];
    if (a === null || a === undefined) missingItems.push(i + 1);
    else if (!Number.isInteger(a) || a < 0 || a > 5) invalidItems.push(i + 1);
  }
  if (answers.length > WHO5_ITEMS.length) invalidItems.push(WHO5_ITEMS.length + 1);
  if (missingItems.length || invalidItems.length) return { ok: false, missingItems, invalidItems };

  const clean = answers.slice(0, 5) as number[];
  const rawScore = clean.reduce((s, v) => s + v, 0);
  return { ok: true, answers: clean, rawScore, percentScore: rawScore * 4 };
}

export type Who5Band = "higher" | "moderate" | "lower";

/** Plain-language, non-diagnostic description of a percentage score. */
export function describeWho5(percentScore: number): {
  band: Who5Band;
  headline: string;
  explanation: string;
  suggestProfessional: boolean;
} {
  if (percentScore <= WHO5_LOW_WELLBEING_THRESHOLD) {
    return {
      band: "lower",
      headline: "Your recent wellbeing looks lower than usual",
      explanation:
        "Scores of 50 or below suggest that the last two weeks have been difficult. This is not a diagnosis — but published WHO-5 guidance recommends talking with a healthcare professional when scores are in this range, so they can understand what's going on and help.",
      suggestProfessional: true,
    };
  }
  if (percentScore < 70) {
    return {
      band: "moderate",
      headline: "Your wellbeing is in a middle range",
      explanation:
        "You're experiencing some good days and some harder ones. Keeping an eye on how this changes over time can be helpful, and small routines around sleep, movement and connection often make a difference.",
      suggestProfessional: false,
    };
  }
  return {
    band: "higher",
    headline: "Your recent wellbeing looks relatively good",
    explanation:
      "Your answers suggest you've mostly felt well over the last two weeks. It's still worth checking in regularly — wellbeing naturally changes over time.",
    suggestProfessional: false,
  };
}

export const WHO5_LIMITATIONS = [
  "The WHO-5 is a short self-report questionnaire about the last two weeks. It measures wellbeing, not illness.",
  "A low score does not mean you have depression or any other condition, and a high score does not rule one out.",
  "The WHO-5 does not assess risk of suicide or self-harm. If you are thinking about harming yourself, please use “Get immediate help”.",
  "Scores can be affected by recent events, physical illness, sleep and many other factors.",
  "Only a qualified professional can make a diagnosis or treatment decision.",
];

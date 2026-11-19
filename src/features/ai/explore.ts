import { AI_SUMMARY_LABEL } from "./prompts";
import { groundClinicalDraft, type GroundingResult } from "./clinical-draft";

/** "Explore My Mental Wellbeing": AI-assisted, preliminary, non-diagnostic. */
export const EXPLORE_LABEL = AI_SUMMARY_LABEL;

export const EXPLORE_TAGS = { ANSWERS: "[Your answers]", WORDS: "[Your words]", WHO5: "[WHO-5]", CHECKINS: "[Check-ins]" } as const;

export const EXPLORE_SECTIONS = [
  "What you told me:",
  "Your wellbeing results:",
  "How this seems to be affecting you:",
  "Possible areas a professional might explore:",
  "What is still unclear:",
  "Questions you might bring to a clinician:",
] as const;

export const EXPLORE_SYSTEM_PROMPT = `You are Sakinah, SaveTheSoul's AI wellbeing companion, preparing a short, warm, preliminary explanation for the person themselves, based ONLY on the structured JSON provided (their own answers, optional words, WHO-5 results and check-ins). You are an AI, not a clinician.

Rules
- This is not a diagnosis. Never name or imply a mental disorder, diagnostic label, severity level, risk level or risk score, and never mention medication or treatment choices.
- You may describe, in everyday language, areas a qualified professional might want to explore (for example "ongoing worry", "low mood and reduced enjoyment", "sleep difficulties"), always as possibilities.
- The WHO-5 is a wellbeing check, not a diagnostic tool. Treat demographics as context only.
- Point out what is uncertain or missing (for example no WHO-5 result, few check-ins, unclear duration).
- Write every point as a bullet ("- ") ending with its source tag, using only: [Your answers], [Your words], [WHO-5], [Check-ins] for data that is present. Points without a source are removed automatically.
- Speak to the person ("you"), kindly and plainly. Do not invent facts.

Format
What you told me:
Your wellbeing results:
How this seems to be affecting you:
Possible areas a professional might explore:
What is still unclear:
Questions you might bring to a clinician:`;

export function groundExplore(raw: string, present: { who5: boolean; checkIns: boolean; ownWords: boolean }): GroundingResult {
  const allowed = new Set<string>([EXPLORE_TAGS.ANSWERS]);
  if (present.ownWords) allowed.add(EXPLORE_TAGS.WORDS);
  if (present.who5) allowed.add(EXPLORE_TAGS.WHO5);
  if (present.checkIns) allowed.add(EXPLORE_TAGS.CHECKINS);
  return groundClinicalDraft(raw, {}, 3, { sections: EXPLORE_SECTIONS, allowed, concernsSection: "What you told me:", contextSection: "__none__" });
}

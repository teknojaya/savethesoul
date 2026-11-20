/** Client-safe Clinical Intelligence constants (no validators). */
export const PROCESSING_VERSION = "ci-1";
export const INSIGHT_LABEL = "Preliminary AI-generated clinical impression — not a confirmed diagnosis. Requires professional assessment.";

export const CATEGORIES = ["WORRY", "STRESS", "LOW_MOOD", "LONELINESS", "GRIEF", "SLEEP", "CONCENTRATION", "ENERGY", "FUNCTIONING", "EMOTIONAL", "OTHER"] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABEL: Record<Category, string> = {
  WORRY: "Worry or anxiety",
  STRESS: "Stress",
  LOW_MOOD: "Low mood",
  LONELINESS: "Loneliness",
  GRIEF: "Grief or loss",
  SLEEP: "Sleep",
  CONCENTRATION: "Concentration",
  ENERGY: "Energy or fatigue",
  FUNCTIONING: "Daily functioning",
  EMOTIONAL: "Emotional difficulties",
  OTHER: "Other",
};


export const ITEM_SECTIONS = ["presentingConcerns", "reportedSymptoms", "durationAndFrequency", "functioningImpact", "contextAndCoping", "reportedChanges"] as const;
export type ItemSection = (typeof ITEM_SECTIONS)[number];
export const SECTION_LABEL: Record<ItemSection, string> = {
  presentingConcerns: "What you've been dealing with",
  reportedSymptoms: "Experiences you described",
  durationAndFrequency: "How long and how often",
  functioningImpact: "Effect on daily life",
  contextAndCoping: "Context and what you've tried",
  reportedChanges: "Changes you mentioned",
};

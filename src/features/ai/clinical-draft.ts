import { checkModelOutput } from "@/features/safety/classifier";

/**
 * Grounding for AI-generated clinical support summaries.
 *
 * The model receives the patient-approved structured data in explicitly separated sections, and
 * every statement it writes must cite one of these sources. After generation, statements are
 * checked and anything unsupported is removed (and counted) before a clinician ever sees it:
 *  - no source tag, or a tag for data the patient did not share;
 *  - demographics (age band, region) presented as a patient-reported concern;
 *  - diagnostic labels, risk levels/scores, medication or treatment content.
 * A draft with too little grounded content is rejected entirely. The result is still labelled
 * as unverified until an authorised clinician reviews it.
 */
export const SOURCE_TAGS = {
  DEMOGRAPHICS: "[Demographics]",
  CONCERNS: "[Patient-reported concerns]",
  NOTE: "[Patient note]",
  WHO5: "[WHO-5]",
  CHECKINS: "[Check-ins]",
  GOALS: "[Goals]",
  PHYSICAL: "[Physical health context]",
  REFERRALS: "[Referral history]",
} as const;

export const DRAFT_SECTIONS = [
  "Patient-reported concerns:",
  "Assessment results and changes over time:",
  "Duration and effect on daily functioning:",
  "Other shared context:",
  "Preliminary observations (AI, unverified):",
  "Questions the clinician may wish to explore:",
  "Referral and follow-up history:",
] as const;

/** The shared-data shape the drafting step receives (subset of SummaryContent). */
export interface DraftSource {
  patient?: { ageBand: string | null; region?: string };
  who5?: unknown[];
  mood?: unknown;
  sleepStress?: unknown;
  functioning?: unknown;
  goals?: unknown[];
  physicalHealthContext?: string | null;
  patientNote?: string | null;
  reportedConcerns?: unknown;
  referralHistory?: unknown[];
}

/** Builds the model input with every kind of information in its own, clearly named section. */
export function buildDraftInput(c: DraftSource & { limitations?: string[] }) {
  return {
    demographics: { ageBand: c.patient?.ageBand ?? null, note: "Demographic context only. Never a symptom or concern." },
    patientReportedConcerns: c.reportedConcerns ?? null,
    patientNote: c.patientNote ?? null,
    validatedAssessments: c.who5 ? { who5: c.who5 } : null,
    selfReportedCheckIns: c.mood || c.sleepStress || c.functioning ? { mood: c.mood ?? null, sleepStress: c.sleepStress ?? null, functioning: c.functioning ?? null } : null,
    goals: c.goals ?? null,
    physicalHealthContext: c.physicalHealthContext ?? null,
    referralHistory: c.referralHistory ?? null,
    limitations: c.limitations ?? [],
  };
}

/** Source tags the model may use for THIS summary (only data the patient shared). */
export function allowedTags(c: DraftSource): Set<string> {
  const t = new Set<string>([SOURCE_TAGS.DEMOGRAPHICS]);
  if (c.reportedConcerns) t.add(SOURCE_TAGS.CONCERNS);
  if (c.patientNote) t.add(SOURCE_TAGS.NOTE);
  if (c.who5?.length) t.add(SOURCE_TAGS.WHO5);
  if (c.mood || c.sleepStress || c.functioning) t.add(SOURCE_TAGS.CHECKINS);
  if (c.goals?.length) t.add(SOURCE_TAGS.GOALS);
  if (c.physicalHealthContext) t.add(SOURCE_TAGS.PHYSICAL);
  if (c.referralHistory) t.add(SOURCE_TAGS.REFERRALS);
  return t;
}

const DEMOGRAPHIC = /\b(age band|aged?\b|years? old|\d{2}\s?[-–]\s?\d{2}\b|\d{2}\+|region|nationality|expat(riate)?|gender|male|female)\b/i;
const DIAGNOSTIC_OR_TREATMENT =
  /\b(major depressi\w*|depressive (episode|disorder)|(generali[sz]ed )?anxiety disorder|panic disorder|bipolar|ptsd|ocd|adhd|schizophren\w*|psychosis|personality disorder|eating disorder|meets? (the )?criteria|consistent with (an? )?(diagnosis|disorder)|diagnos(is|ed|e)\s+(of|with)|(suicid\w*|self-harm) risk (is|level|score)|risk (level|score|rating)|(high|moderate|low|elevated)[- ]risk|ssri|snri|antidepressant|sertraline|fluoxetine|escitalopram|medication (should|change|increase|decrease)|prescri\w+)\b/i;
const TAG = /\[[^\]]+\]/g;

export interface GroundingResult {
  text: string | null;
  kept: number;
  removed: number;
  reasons: string[];
}

/**
 * Removes unsupported statements from a model draft. Returns text: null when too little grounded
 * content remains (the clinician then sees "no AI draft available" and uses the structured data).
 */
export interface GroundingConfig {
  sections?: readonly string[];
  allowed?: Set<string>;
  /** Section in which demographics must never appear as a concern. */
  concernsSection?: string;
  /** The only section where demographic context is allowed. */
  contextSection?: string;
}

export function groundClinicalDraft(raw: string, source: DraftSource, minStatements = 2, config: GroundingConfig = {}): GroundingResult {
  const allowed = config.allowed ?? allowedTags(source);
  const sections = config.sections ?? DRAFT_SECTIONS;
  const concernsSection = config.concernsSection ?? "Patient-reported concerns:";
  const contextSection = config.contextSection ?? "Other shared context:";
  const reasons: string[] = [];
  const out: string[] = [];
  let section = "";
  let kept = 0;
  let removed = 0;
  const drop = (why: string) => {
    removed++;
    reasons.push(why);
  };

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const header = sections.find((h) => trimmed.replace(/^#+\s*|\*\*/g, "").startsWith(h.replace(":", "")));
    if (header) {
      section = header;
      out.push(header);
      continue;
    }
    if (/AI-generated clinical (support summary|impression)/i.test(trimmed)) continue; // the UI always shows the label
    if (!/^[-•*]\s+/.test(trimmed)) {
      drop("not a statement in the required format");
      continue;
    }
    const tags: string[] = trimmed.match(TAG) ?? [];
    if (!tags.length) {
      drop("no source");
      continue;
    }
    if (tags.some((t) => !allowed.has(t))) {
      drop("cites data that was not shared");
      continue;
    }
    if (DIAGNOSTIC_OR_TREATMENT.test(trimmed.replace(/not a confirmed diagnosis|cannot (confirm|establish)[^.]*diagnosis/gi, ""))) {
      drop("diagnostic, risk or treatment content");
      continue;
    }
    if (checkModelOutput(trimmed).length) {
      drop("clinical boundary");
      continue;
    }
    if (section === concernsSection && (tags.includes(SOURCE_TAGS.DEMOGRAPHICS) || DEMOGRAPHIC.test(trimmed.replace(TAG, "")))) {
      drop("demographics presented as a concern");
      continue;
    }
    if (tags.includes(SOURCE_TAGS.DEMOGRAPHICS) && section !== contextSection) {
      drop("demographics outside context");
      continue;
    }
    out.push(trimmed);
    kept++;
  }

  // Remove headers left without statements.
  const isHeader = (l: string | undefined) => !!l && sections.includes(l);
  const compact = out.filter((l, i) => !isHeader(l) || (out[i + 1] !== undefined && !isHeader(out[i + 1])));
  if (kept < minStatements) return { text: null, kept, removed, reasons };
  const footer = removed ? `\n\n(${removed} AI statement${removed === 1 ? " was" : "s were"} removed by automatic grounding checks.)` : "";
  return { text: compact.join("\n").replace(/\n(?=[A-Z][^\n]*:$)/gm, "\n\n") + footer, kept, removed, reasons };
}

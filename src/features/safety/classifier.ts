/**
 * SaveTheSoul Safety Guardian — rule-based risk-language detector (rules-v1).
 *
 * Design principles (see docs/AI_SAFETY.md):
 *  1. It runs BEFORE and independently of the LLM, so it works when the model is down.
 *  2. It is deliberately sensitive: when language is ambiguous we ask a gentle safety
 *     question rather than dismissing it. A false positive costs a caring question;
 *     a false negative can cost much more.
 *  3. "NO_FLAG" means only "these rules did not match". It is NEVER evidence of safety,
 *     and the UI keeps "Get immediate help" visible at all times.
 *  4. It does not predict risk or produce a clinical determination. It routes the
 *     conversation to a safer response pattern and offers human help.
 *  5. Negation can lower IMMEDIATE to ELEVATED, but never to NO_FLAG.
 */

export type SafetyLevel = "IMMEDIATE_DANGER" | "ELEVATED_CONCERN" | "NO_FLAG";

export type SafetyCategory =
  | "SUICIDE_INTENT_IMMINENT"
  | "OVERDOSE_OR_ACT_IN_PROGRESS"
  | "FAREWELL_MESSAGE"
  | "HARM_TO_OTHERS"
  | "UNSAFE_ENVIRONMENT"
  | "SUICIDAL_IDEATION"
  | "SELF_HARM"
  | "HOPELESSNESS"
  | "AMBIGUOUS_DISTRESS"
  | "THIRD_PARTY_CONCERN";

export interface SafetyAssessment {
  level: SafetyLevel;
  categories: SafetyCategory[];
  /** Detector version — stored with SafetyEvents for auditability. */
  detector: "rules-v1";
  /** True if a negation softened an otherwise immediate match. */
  negated: boolean;
}

interface Rule {
  category: SafetyCategory;
  level: Exclude<SafetyLevel, "NO_FLAG">;
  patterns: RegExp[];
}

const SELF = String.raw`(?:myself|my self|my life)`;
const NOW = String.raw`(?:tonight|right now|now|today|this (?:evening|morning|afternoon|weekend)|in (?:a few|an?) (?:minutes?|hours?)|soon)`;

const RULES: Rule[] = [
  {
    category: "OVERDOSE_OR_ACT_IN_PROGRESS",
    level: "IMMEDIATE_DANGER",
    patterns: [
      /\bi(?:'ve| have)? (?:just )?(?:taken|took|swallowed) (?:all|a lot|too many|loads|a bottle|the whole|\d+)[\w\s]{0,20}(?:pills|tablets|meds|medication|paracetamol|panadol)\b/,
      /\bi(?:'ve| have| just)? ?(?:overdosed|od'?d)\b/,
      /\bi(?:'ve| have)? (?:just )?(?:cut|slit) my (?:wrists?|arms?|throat)\b/,
      /\bi(?:'m| am) (?:bleeding|losing (?:a lot of )?blood) (?:a lot|badly|heavily)\b/,
      /\b(?:standing|sitting|i'?m) (?:on|at) the (?:edge|ledge|roof|bridge|balcony)\b.{0,40}\b(?:jump|end it|fall|let go)\b/,
    ],
  },
  {
    category: "SUICIDE_INTENT_IMMINENT",
    level: "IMMEDIATE_DANGER",
    patterns: [
      new RegExp(String.raw`\b(?:going to|gonna|about to|will|i'?ll|plan(?:ning)? to|decided to) (?:kill ${SELF}|end ${SELF}|end it(?: all)?|take my (?:own )?life|commit suicide)\b.{0,30}\b${NOW}\b`),
      new RegExp(String.raw`\b${NOW}\b.{0,30}\b(?:kill ${SELF}|end ${SELF}|end it(?: all)?|take my (?:own )?life|commit suicide)\b`),
      /\b(?:i'?m|i am) (?:going to|gonna|about to) (?:kill myself|end my life|take my (?:own )?life|commit suicide)\b/,
      /\bi (?:have|bought|got) (?:a |the )?(?:gun|rope|pills|knife|blade)\b.{0,40}\b(?:kill myself|end (?:it|my life)|die)\b/,
      /\bi(?:'ve| have)? ?(?:have|made|got|worked out|figured out) a plan (?:to|for how to|of how to) (?:kill myself|end my life|die|take my (?:own )?life)\b/,
      /\bi want to die (?:tonight|right now|now|today)\b/,
      /\bi(?:'ll| will) (?:kill myself|end my life|take my (?:own )?life)\b/,
      /\bsuicide note\b/,
      // Arabic: "I will kill myself" / "I will commit suicide". (\b is ASCII-only in JS, so no boundaries.)
      /سأقتل نفسي|سأنتحر/,
    ],
  },
  {
    category: "FAREWELL_MESSAGE",
    level: "IMMEDIATE_DANGER",
    patterns: [
      /\bthis is (?:my|the) (?:last|final) (?:message|goodbye|time (?:you'?ll|you will) hear from me)\b/,
      /\bgoodbye (?:forever|everyone|world)\b/,
      /\bby the time you read this\b/,
    ],
  },
  {
    category: "HARM_TO_OTHERS",
    level: "IMMEDIATE_DANGER",
    patterns: [
      /\bi(?:'m| am)? (?:going to|gonna|about to|will) (?:kill|hurt|stab|shoot|attack) (?:him|her|them|someone|somebody|my (?:wife|husband|child|kids?|son|daughter|mother|father|boss|colleague))\b/,
    ],
  },
  {
    category: "UNSAFE_ENVIRONMENT",
    level: "IMMEDIATE_DANGER",
    patterns: [
      /\b(?:he|she|they|someone) (?:is|are|keeps) (?:hitting|beating|choking|strangling|threatening to kill) me\b/,
      /\bi(?:'m| am) not safe (?:at home|here|right now)\b/,
      /\bi(?:'m| am) (?:being|getting) (?:hurt|attacked|abused) right now\b/,
    ],
  },
  {
    category: "THIRD_PARTY_CONCERN",
    level: "ELEVATED_CONCERN",
    patterns: [
      /\b(?:my )?(?:friend|brother|sister|son|daughter|mother|mom|mum|father|dad|husband|wife|partner|colleague|he|she|they)(?: is| are|'s)? (?:going to|wants? to|talking about|said (?:he|she|they) (?:wants?|would)) (?:to )?(?:kill (?:himself|herself|themselves)|end (?:his|her|their) life|commit suicide)\b/,
    ],
  },
  {
    category: "SUICIDAL_IDEATION",
    level: "ELEVATED_CONCERN",
    patterns: [
      /\bkill(?:ing)? myself\b/,
      /\bsuicid(?:e|al)\b/,
      /\b(?:want|wanted|wanting|wish) (?:to|i could|i was|i were) (?:die|dead|be dead)\b/,
      /\bi want to die\b/,
      /\bwish i (?:was|were|had) (?:dead|never been born)\b/,
      /\bend (?:my life|it all)\b/,
      /\btake my (?:own )?life\b/,
      /\b(?:everyone|they|my family) (?:would be|is|are) better off without me\b/,
      // Arabic: "I want to die" / "suicide"
      /أريد أن أموت|انتحار/,
    ],
  },
  {
    category: "SELF_HARM",
    level: "ELEVATED_CONCERN",
    patterns: [
      /\bself[- ]?harm(?:ing)?\b/,
      /\b(?:cut|cutting|burn|burning|hurt|hurting|harm|harming) myself\b/,
      /\bwant to (?:hurt|harm|punish) myself\b/,
    ],
  },
  {
    category: "HOPELESSNESS",
    level: "ELEVATED_CONCERN",
    patterns: [
      /\bno (?:reason|point) (?:to|in) (?:live|living|going on|being alive)\b/,
      /\b(?:life is|my life is) (?:not worth living|pointless|meaningless)\b/,
      /\bnot worth living\b/,
      /\bthere'?s no way out\b/,
      /\bi(?:'m| am) a burden (?:to|on) (?:everyone|my family|them)\b/,
    ],
  },
  {
    category: "AMBIGUOUS_DISTRESS",
    level: "ELEVATED_CONCERN",
    patterns: [
      /\bi can'?t (?:go on|do this anymore|take (?:it|this) anymore|keep going)\b/,
      /\bi don'?t want to (?:be here|exist|wake up|be alive)(?: anymore)?\b/,
      /\b(?:want|wish i could) (?:to )?disappear (?:forever|for good)\b/,
      /\bwhat'?s the point (?:of anything|anymore|of living)\b/,
      /\bi just want (?:it all )?to (?:stop|end)\b/,
      /\bsleep (?:forever|and never wake up)\b/,
    ],
  },
];

/**
 * Figurative / idiomatic uses that commonly contain risk words. These ONLY suppress
 * a match when the whole matching phrase is explained by the idiom.
 */
const IDIOMS: RegExp[] = [
  /\b(?:die|died|dying) (?:of|from) (?:laughter|laughing|embarrassment|boredom|shame|cuteness)\b/,
  /\bkill(?:ing)? myself laughing\b/,
  /\bwant to die (?:of|from) (?:laughter|laughing|embarrassment|boredom|shame)\b/,
];

const NEGATIONS: RegExp[] = [
  /\b(?:i'?m|i am) not (?:going to|gonna|planning to|about to) (?:kill myself|end my life|hurt myself|end it)\b/,
  /\bi would never (?:kill myself|end my life|hurt myself)\b/,
  /\bi(?:'m| am) not suicidal\b/,
];

export function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function assessMessage(text: string): SafetyAssessment {
  const t = normalise(text);
  if (!t) return { level: "NO_FLAG", categories: [], detector: "rules-v1", negated: false };

  // Remove idiomatic phrases before matching so "dying of laughter" doesn't trigger,
  // while any additional genuine risk language in the same message still does.
  let scrubbed = t;
  for (const idiom of IDIOMS) scrubbed = scrubbed.replace(new RegExp(idiom.source, "g"), " ");

  const negated = NEGATIONS.some((n) => n.test(scrubbed));
  const categories = new Set<SafetyCategory>();
  let level: SafetyLevel = "NO_FLAG";

  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(scrubbed))) {
      categories.add(rule.category);
      if (rule.level === "IMMEDIATE_DANGER") level = "IMMEDIATE_DANGER";
      else if (level === "NO_FLAG") level = "ELEVATED_CONCERN";
    }
  }

  // Negated self-directed statements are softened, never cleared:
  // "I'm not going to kill myself tonight" still deserves a caring check-in.
  if (negated && level === "IMMEDIATE_DANGER") {
    const selfDirected: SafetyCategory[] = ["SUICIDE_INTENT_IMMINENT"];
    const onlySelf = [...categories].every((c) => selfDirected.includes(c) || c === "SUICIDAL_IDEATION");
    if (onlySelf) level = "ELEVATED_CONCERN";
  }
  if (negated && level === "NO_FLAG") {
    // Mentioning suicide at all warrants a gentle check-in.
    level = "ELEVATED_CONCERN";
    categories.add("SUICIDAL_IDEATION");
  }

  return { level, categories: [...categories], detector: "rules-v1", negated };
}

// ─────────────────────────── Output guard ───────────────────────────

export type OutputViolation =
  | "CLAIMS_CLINICIAN_IDENTITY"
  | "DIAGNOSIS"
  | "MEDICATION_INSTRUCTION"
  | "HARMFUL_METHOD_INFO"
  | "DISCOURAGES_HELP";

const OUTPUT_RULES: { violation: OutputViolation; pattern: RegExp }[] = [
  { violation: "CLAIMS_CLINICIAN_IDENTITY", pattern: /\b(?:i am|i'm) (?:a|your) (?:licensed |qualified |real )?(?:psychiatrist|psychologist|therapist|doctor|physician|counsell?or)\b/ },
  { violation: "CLAIMS_CLINICIAN_IDENTITY", pattern: /\b(?:i am|i'm) (?:a )?human\b/ },
  { violation: "DIAGNOSIS", pattern: /\byou (?:have|are suffering from|definitely have|clearly have|meet the criteria for) (?:clinical |major |severe )?(?:depression|bipolar|ptsd|ocd|adhd|schizophrenia|an? (?:\w+ )?(?:anxiety )?disorder)\b/ },
  { violation: "DIAGNOSIS", pattern: /\bi (?:diagnose|am diagnosing) you\b/ },
  { violation: "MEDICATION_INSTRUCTION", pattern: /\b(?:take|start|stop|increase|decrease|double)\s+(?:\d+\s?mg|your (?:dose|medication|meds)|(?:sertraline|fluoxetine|escitalopram|citalopram|paroxetine|venlafaxine|duloxetine|bupropion|mirtazapine|quetiapine|olanzapine|lithium|diazepam|alprazolam|lorazepam|clonazepam|zolpidem))\b/ },
  { violation: "HARMFUL_METHOD_INFO", pattern: /\b(?:lethal dose|fatal dose|how many (?:pills|tablets) (?:would|to)|painless way to (?:die|kill)|most effective way to (?:die|kill|end))\b/ },
  { violation: "DISCOURAGES_HELP", pattern: /\b(?:you )?(?:don'?t|do not) need (?:a |to see a |to call )?(?:therapist|doctor|professional|psychiatrist|help|emergency services)\b/ },
];

/**
 * Words that, shortly before a diagnosis/medication phrase in the same clause, mean the model
 * is declining rather than asserting ("I can't tell you whether you have depression",
 * "I can't tell you to start sertraline"). Deliberately narrow: bare "not"/"don't" are not
 * included, so "it's not a bad idea to start sertraline" is still blocked.
 */
const REFUSAL_CUE = /\b(?:can't|cannot|can not|won't|unable to|not able to|not in a position to|whether|if|don't know|not sure)\b/g;
/** A contrast after the cue re-opens the assertion: "I can't be sure, but you have depression". */
const CONTRAST = /\b(?:but|however|although|though|yet)\b/;
const NEGATABLE: ReadonlySet<OutputViolation> = new Set(["DIAGNOSIS", "MEDICATION_INSTRUCTION"]);

function declinedAt(t: string, index: number): boolean {
  const clause = t.slice(Math.max(0, index - 120), index).split(/[.!?;:\n]/).pop() ?? "";
  const window = clause.trim().split(/\s+/).slice(-10).join(" ");
  const cues = [...window.matchAll(REFUSAL_CUE)];
  const last = cues[cues.length - 1];
  if (!last) return false;
  return !CONTRAST.test(window.slice(last.index! + last[0].length));
}

function violates(rule: (typeof OUTPUT_RULES)[number], t: string): boolean {
  if (!NEGATABLE.has(rule.violation)) return rule.pattern.test(t);
  const global = new RegExp(rule.pattern.source, rule.pattern.flags.includes("g") ? rule.pattern.flags : rule.pattern.flags + "g");
  for (const m of t.matchAll(global)) if (!declinedAt(t, m.index!)) return true;
  return false;
}

/** Checks model output before it is shown. Any violation replaces the reply with a safe template. */
export function checkModelOutput(text: string): OutputViolation[] {
  const t = normalise(text);
  return [...new Set(OUTPUT_RULES.filter((r) => violates(r, t)).map((r) => r.violation))];
}

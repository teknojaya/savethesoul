/**
 * Presentation-only clean-up of demo markers inside stored demo text (stored data is unchanged).
 * The demo is identified once per portal (a "Demo" pill), not on every line.
 */
const PATTERNS: [RegExp, string][] = [
  [/DEMO — Synthetic Patient and Fictional Clinical Record[.:]?\s*/g, ""],
  [/UNVERIFIED AI DRAFT \(synthetic\)\s*\n?/g, ""],
  [/^(Example clinician-authored diagnosis|Example care plan):\s*/gm, ""],
  [/\b(Fictional|Synthetic) (follow-up note|assessment note):\s*/g, ""],
  [/\s*\(fictional\):\s*/g, ": "],
  [/^Fictional:\s*/g, ""],
  [/\b[Tt]he synthetic patient\b/g, "The patient"],
  [/^Fictional response note \(([^)]*)\)\.?$/g, "Response note: $1."],
  [/^Synthetic demo (account|record): fictional emergency-disclosure authorisation\..*$/g, "Emergency-disclosure authorisation recorded in the patient's safety plan."],
  [/\s*\((synthetic|synthetic location|demo|fictional)\)/gi, ""],
  [/ \(no prescription is recorded in this demo\)/g, ""],
  [/^Demo (coordinator|crisis nurse|social worker)$/g, "Duty $1"],
];

export function cleanDemoText(s: string): string;
export function cleanDemoText(s: string | null | undefined): string | null;
export function cleanDemoText(s: string | null | undefined): string | null {
  if (s == null) return null;
  let out = s;
  for (const [re, to] of PATTERNS) out = out.replace(re, to);
  out = out.trim();
  return out.charAt(0).toUpperCase() + out.slice(1);
}

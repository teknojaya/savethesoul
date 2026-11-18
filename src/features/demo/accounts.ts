/** Synthetic demo accounts (see prisma/seed.ts). Shown only when DEMO_MODE=true. */
export const DEMO_PASSWORD = "SaveTheSoul-demo-2026";

export const DEMO_ACCOUNTS = [
  { email: "omar@demo.savethesoul.app", label: "Omar", role: "Patient", scenario: "Everyday support · urgent safety · family support" },
  { email: "layla@demo.savethesoul.app", label: "Layla", role: "Patient", scenario: "Declining wellbeing · share with clinician" },
  { email: "dr.aisha@demo.savethesoul.app", label: "Dr. Aisha Al Mansoori", role: "Psychiatrist", scenario: "Clinician portal · referrals · follow-up" },
  { email: "dr.james@demo.savethesoul.app", label: "Dr. James Okafor", role: "Psychologist", scenario: "Access restrictions (different caseload)" },
] as const;

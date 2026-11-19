/** Synthetic demo accounts (see prisma/seed.ts and scripts/prepare-demo.ts). Shown only when DEMO_MODE=true. */
export const DEMO_PASSWORD = "SaveTheSoul-demo-2026";

/** One-click demo sign-in keys (local part of the @demo.savethesoul.app email). Server-validated. */
export const DEMO_LOGIN_KEYS = ["omar", "layla", "dr.aisha", "dr.james", "coordinator"] as const;
export type DemoLoginKey = (typeof DEMO_LOGIN_KEYS)[number];

export const DEMO_GROUPS: { title: string; description: string; accounts: { key: DemoLoginKey; label: string; role: string; scenario: string }[] }[] = [
  {
    title: "Patient Demo",
    description: "Experience Sakinah, wellbeing assessments and referrals.",
    accounts: [
      { key: "omar", label: "Omar", role: "Patient", scenario: "Everyday support · urgent safety · family support" },
      { key: "layla", label: "Layla", role: "Patient", scenario: "Declining wellbeing · share with clinician" },
    ],
  },
  {
    title: "Clinician Demo",
    description: "Review patient-approved information, clinical summaries and follow-up plans.",
    accounts: [
      { key: "dr.aisha", label: "Dr. Aisha Al Mansoori", role: "Psychiatrist", scenario: "Clinical review · fictional diagnoses · referrals" },
      { key: "dr.james", label: "Dr. James Okafor", role: "Psychologist", scenario: "Different caseload (access restrictions)" },
    ],
  },
  {
    title: "Hospital Emergency Demo",
    description: "Explore simulated urgent safety alerts and coordinated human response.",
    accounts: [{ key: "coordinator", label: "Emergency Coordinator", role: "Hospital (synthetic)", scenario: "Simulated alerts · response workflow" }],
  },
];

/** Back-compat list used by the sign-in page and tests. */
export const DEMO_ACCOUNTS = DEMO_GROUPS.flatMap((g) => g.accounts.map((a) => ({ email: `${a.key}@demo.savethesoul.app`, label: a.label, role: a.role, scenario: a.scenario })));

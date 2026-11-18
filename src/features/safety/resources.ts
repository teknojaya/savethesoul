/**
 * Verified support resources for Abu Dhabi / UAE.
 *
 * This module is static on purpose: emergency information must render even when the
 * database, network or LLM is unavailable. It also seeds the SupportResource table.
 *
 * Verification performed on 2026-11-18 (see docs/AI_SAFETY.md §Resource verification).
 * Every number MUST be re-verified by the operating clinical team before any real use.
 */

export type ResourceCategory =
  | "EMERGENCY"
  | "CRISIS_LINE"
  | "SELF_HELP"
  | "COMMUNITY"
  | "PRIMARY_CARE"
  | "MENTAL_HEALTH_CONSULTATION"
  | "TELE_MENTAL_HEALTH"
  | "PSYCHIATRIC_SPECIALIST";

export type VerificationStatus = "VERIFIED_OFFICIAL" | "VERIFIED_SECONDARY" | "NEEDS_VERIFICATION";

export interface SupportResourceData {
  slug: string;
  name: string;
  category: ResourceCategory;
  description: string;
  phone?: string;
  /** Digits-only form for tel: links */
  dial?: string;
  website?: string;
  hours?: string;
  languages?: string;
  eligibility?: string;
  nextSteps: string;
  verificationStatus: VerificationStatus;
  verificationNote?: string;
  verifiedAt?: string;
  sourceUrl?: string;
  sortOrder: number;
}

export const VERIFIED_ON = "2026-11-18";

export const SUPPORT_RESOURCES: SupportResourceData[] = [
  {
    slug: "uae-ambulance-998",
    name: "Ambulance (UAE emergency)",
    category: "EMERGENCY",
    description: "Emergency medical response anywhere in the UAE, including if someone has harmed themselves or is in immediate danger.",
    phone: "998",
    dial: "998",
    hours: "24/7",
    languages: "Arabic, English",
    eligibility: "Anyone in the UAE",
    nextSteps: "Call 998. Say where you are, what has happened and whether anyone is injured. Stay on the line.",
    verificationStatus: "VERIFIED_OFFICIAL",
    verifiedAt: VERIFIED_ON,
    sourceUrl: "https://u.ae/en/information-and-services/justice-safety-and-the-law/safety/handling-emergencies",
    sortOrder: 1,
  },
  {
    slug: "uae-police-999",
    name: "Police (UAE emergency)",
    category: "EMERGENCY",
    description: "Police emergency line for immediate danger to you or others.",
    phone: "999",
    dial: "999",
    hours: "24/7",
    languages: "Arabic, English",
    eligibility: "Anyone in the UAE",
    nextSteps: "Call 999 if you or someone else is in immediate danger. In Abu Dhabi, the AD999 app also has an SOS button.",
    verificationStatus: "VERIFIED_OFFICIAL",
    verifiedAt: VERIFIED_ON,
    sourceUrl: "https://u.ae/en/information-and-services/justice-safety-and-the-law/safety/handling-emergencies",
    sortOrder: 2,
  },
  {
    slug: "doh-800-sakina",
    name: "800-SAKINA Mental Health Support Line",
    category: "CRISIS_LINE",
    description: "Free, confidential mental health support line run by the Department of Health – Abu Dhabi with Sakina (SEHA). Psychological first aid and qualified mental health professionals, including support for children and families.",
    phone: "800-SAKINA (800 725462)",
    dial: "800725462",
    website: "https://www.doh.gov.ae",
    hours: "24/7",
    languages: "Arabic, English",
    eligibility: "Residents of and visitors to Abu Dhabi",
    nextSteps: "Call 800 725462 any time. You can say “I'm struggling and need to talk to someone” — no other preparation is needed.",
    verificationStatus: "VERIFIED_SECONDARY",
    verificationNote: "Announced by DoH Abu Dhabi (Mar 2026). Official DoH page could not be fetched directly during verification; details corroborated by DoH-attributed news coverage.",
    verifiedAt: VERIFIED_ON,
    sourceUrl: "https://gulfnews.com/uae/health/feeling-anxious-abu-dhabi-activates-247-mental-health-hotline-to-offer-immediate-help-1.500460670",
    sortOrder: 3,
  },
  {
    slug: "uae-national-support-line-800-hope",
    name: "National Mental Support Line (800-HOPE)",
    category: "CRISIS_LINE",
    description: "Free national psychological support line available by phone in Arabic and English.",
    phone: "800-HOPE (800 4673)",
    dial: "8004673",
    hours: "Hours vary by source — confirm before relying on it",
    languages: "Arabic, English",
    eligibility: "Anyone in the UAE",
    nextSteps: "Call 800 4673. If it is outside operating hours and you are in danger, call 999 or 998.",
    verificationStatus: "NEEDS_VERIFICATION",
    verificationNote: "Number consistent across sources; published operating hours conflict (8am–8pm daily vs. 24/7).",
    verifiedAt: VERIFIED_ON,
    sourceUrl: "https://www.thenationalnews.com/uae/health/coronavirus-uae-sets-up-free-national-helpline-to-support-mental-health-1.1021577",
    sortOrder: 4,
  },
  {
    slug: "abudhabi-istijaba-8001717",
    name: "Istijaba (DoH Abu Dhabi helpline)",
    category: "COMMUNITY",
    description: "Toll-free Department of Health – Abu Dhabi helpline listed on the official UAE government portal; delivered with the Department of Community Development for community wellbeing support.",
    phone: "800 1717",
    dial: "8001717",
    languages: "Arabic, English",
    eligibility: "Abu Dhabi",
    nextSteps: "Call 800 1717 and ask for guidance on mental health and community support services.",
    verificationStatus: "VERIFIED_OFFICIAL",
    verificationNote: "Number listed on u.ae; scope of mental-health support should be confirmed with DoH.",
    verifiedAt: VERIFIED_ON,
    sourceUrl: "https://u.ae/en/information-and-services/justice-safety-and-the-law/safety/handling-emergencies",
    sortOrder: 10,
  },
  {
    slug: "abudhabi-aman-8002626",
    name: "Abu Dhabi Police — Aman service",
    category: "COMMUNITY",
    description: "Confidential Abu Dhabi Police service for reporting safety concerns, including harassment or feeling unsafe.",
    phone: "800 2626 (SMS 2828)",
    dial: "8002626",
    languages: "Arabic, English",
    eligibility: "Abu Dhabi",
    nextSteps: "Call 800 2626 or send an SMS to 2828. If you are in immediate danger, call 999.",
    verificationStatus: "VERIFIED_OFFICIAL",
    verifiedAt: VERIFIED_ON,
    sourceUrl: "https://u.ae/en/information-and-services/justice-safety-and-the-law/safety/handling-emergencies",
    sortOrder: 11,
  },
  {
    slug: "abudhabi-primary-care-mental-health",
    name: "Primary Care Centres (integrated mental health)",
    category: "PRIMARY_CARE",
    description: "DoH Abu Dhabi has integrated mental health services into primary care, so your family doctor or local primary care centre is a good first step for ongoing concerns.",
    website: "https://www.doh.gov.ae",
    eligibility: "Depends on insurance and centre; Thiqa and most insurance plans cover primary care",
    nextSteps: "Book an appointment with your primary care doctor and mention that you would like to discuss your mental wellbeing. You can bring your SaveTheSoul summary if you wish.",
    verificationStatus: "VERIFIED_SECONDARY",
    verificationNote: "Based on a DoH Abu Dhabi news release (Aug 2026). Specific centres and booking routes to be confirmed.",
    verifiedAt: VERIFIED_ON,
    sourceUrl: "https://www.doh.gov.ae/en/news/from-specialised-care-to-community-centered-support-ad-redefines-access-to-mh-services",
    sortOrder: 20,
  },
  {
    slug: "sakina-seha-network",
    name: "Sakina Mental Health Network (SEHA / PureHealth)",
    category: "PSYCHIATRIC_SPECIALIST",
    description: "Specialist mental health network in Abu Dhabi offering outpatient psychiatry and psychology, including child and adolescent services.",
    website: "https://sakina.seha.ae",
    eligibility: "Referral and insurance requirements vary — check when booking",
    nextSteps: "Ask your primary care doctor about a referral, or contact Sakina via its website or the 800-SAKINA line to ask about appointments.",
    verificationStatus: "VERIFIED_SECONDARY",
    verificationNote: "Website domain observed in search results; booking pathway not yet confirmed.",
    verifiedAt: VERIFIED_ON,
    sourceUrl: "https://sakina.seha.ae",
    sortOrder: 30,
  },
  {
    slug: "doh-tele-mental-health",
    name: "Tele-mental health (licensed providers)",
    category: "TELE_MENTAL_HEALTH",
    description: "Several DoH-licensed providers offer video consultations with psychologists and psychiatrists. SaveTheSoul has not yet verified a specific provider.",
    eligibility: "Varies by provider and insurance",
    nextSteps: "Ask 800-SAKINA or your primary care doctor for a licensed tele-mental-health provider. Check that the clinician is licensed by DoH Abu Dhabi.",
    verificationStatus: "NEEDS_VERIFICATION",
    verificationNote: "Placeholder category: no specific tele-mental-health provider has been verified.",
    sortOrder: 40,
  },
  {
    slug: "self-help-grounding",
    name: "Grounding & breathing exercises (in-app)",
    category: "SELF_HELP",
    description: "Short, evidence-informed exercises such as 5-4-3-2-1 grounding and slow paced breathing, available in the AI Companion and on the help page.",
    eligibility: "Everyone",
    nextSteps: "Open the AI Companion and ask for a grounding exercise, or use the breathing guide on the Get Help page.",
    verificationStatus: "VERIFIED_OFFICIAL",
    verificationNote: "Internal content; not a substitute for professional care.",
    sortOrder: 50,
  },
];

export const EMERGENCY_RESOURCES = SUPPORT_RESOURCES.filter(
  (r) => r.category === "EMERGENCY" || r.category === "CRISIS_LINE",
);

/**
 * Localisation scaffolding. The MVP ships English; Arabic (RTL) is prepared:
 *  - every locale declares its text direction, applied to <html dir>
 *  - layouts use logical CSS properties (ms-/me-/ps-/pe-/start/end) so they mirror in RTL
 *  - user-facing navigation strings live in dictionaries below
 */
export const LOCALES = {
  en: { label: "English", dir: "ltr" },
  ar: { label: "العربية", dir: "rtl" },
} as const;

export type Locale = keyof typeof LOCALES;
export const DEFAULT_LOCALE: Locale = "en";

export function dirFor(locale: string): "ltr" | "rtl" {
  return (LOCALES as Record<string, { dir: "ltr" | "rtl" }>)[locale]?.dir ?? "ltr";
}

export const NAV = {
  en: {
    dashboard: "Home",
    companion: "Companion",
    wellbeing: "My Wellbeing",
    support: "Find Support",
    circle: "Trusted Circle",
    privacy: "Profile & Privacy",
    getHelp: "Get help now",
  },
  ar: {
    dashboard: "الرئيسية",
    companion: "الرفيق",
    wellbeing: "صحتي النفسية",
    support: "ابحث عن الدعم",
    circle: "دائرة الثقة",
    privacy: "الملف والخصوصية",
    getHelp: "احصل على المساعدة الآن",
  },
} satisfies Record<Locale, Record<string, string>>;

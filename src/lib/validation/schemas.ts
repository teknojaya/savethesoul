import { z } from "zod";
import { CLINICIAN_SHARE_CATEGORIES, CONTACT_SHARE_CATEGORIES } from "@/features/consent/policy";

/** Shared request schemas (usable by server, web client and a future native client). */

const id = z.string().min(1).max(64);
const shortText = (max: number) => z.string().trim().min(1).max(max);

export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

export const RegisterSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z
    .string()
    .min(10, "Use at least 10 characters")
    .max(200)
    .regex(/[A-Za-z]/, "Include a letter")
    .regex(/[0-9]/, "Include a number"),
  preferredName: shortText(60),
  acceptTerms: z.literal(true, { message: "You need to accept the terms to continue" }),
});

export const OnboardingSchema = z.object({
  aiProcessing: z.literal(true, { message: "The AI companion needs your consent to process messages" }),
  chatHistoryEnabled: z.boolean(),
  memoryEnabled: z.boolean(),
  aggregateAnalytics: z.boolean(),
  ageBand: z.enum(["18-24", "25-34", "35-44", "45-54", "55-64", "65+"]).nullable().optional(),
});

export const PreferencesSchema = z
  .object({
    chatHistoryEnabled: z.boolean(),
    memoryEnabled: z.boolean(),
    preferredName: shortText(60),
    physicalHealthContext: z.string().trim().max(1000).nullable(),
  })
  .partial();

export const SendMessageSchema = z.object({
  content: shortText(4000),
  /** "voice" when the message was spoken and transcribed (Voice Mode); the reply is kept short for speech. */
  inputMode: z.enum(["text", "voice"]).default("text"),
});

export const Who5Schema = z.object({
  answers: z.array(z.number().int().min(0).max(5).nullable()).length(5),
});

const scale = z.number().int().min(1).max(5);
export const CheckInSchema = z.object({
  mood: scale,
  stress: scale.nullable().optional(),
  sleepQuality: scale.nullable().optional(),
  functioning: scale.nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

export const GoalSchema = z.object({ title: shortText(140) });
export const GoalUpdateSchema = z.object({ status: z.enum(["ACTIVE", "ACHIEVED", "ARCHIVED"]) });

export const MemorySchema = z.object({ content: shortText(300) });

const clinicianCategory = z.enum(Object.keys(CLINICIAN_SHARE_CATEGORIES) as [keyof typeof CLINICIAN_SHARE_CATEGORIES]);
const contactCategory = z.enum(Object.keys(CONTACT_SHARE_CATEGORIES) as [keyof typeof CONTACT_SHARE_CATEGORIES]);

export const SummaryPreviewSchema = z.object({
  clinicianId: id,
  categories: z.array(clinicianCategory).min(1, "Choose at least one type of information"),
  patientNote: z.string().trim().max(1000).nullable().optional(),
});

export const SummaryShareSchema = SummaryPreviewSchema.extend({
  confirm: z.literal(true, { message: "Please confirm you have reviewed the summary" }),
});

export const TrustedContactSchema = z.object({
  name: shortText(80),
  relationship: z.enum(["Parent", "Spouse / partner", "Sibling", "Child", "Relative", "Friend", "Colleague", "Other"]),
  phone: z.string().trim().max(30).regex(/^[+0-9 ()-]*$/, "Use digits, spaces and + only").nullable().optional(),
  email: z.string().trim().email().max(200).nullable().optional().or(z.literal("")),
  canReceiveUpdates: z.boolean(),
  canReceiveSafetyAlerts: z.boolean(),
  sharedCategories: z.array(contactCategory),
  isSafetyPlanContact: z.boolean(),
});

export const TrustedContactUpdateSchema = TrustedContactSchema.partial();

export const NotifySchema = z.object({
  kind: z.enum(["ORDINARY_UPDATE", "SAFETY_ALERT"]),
  category: contactCategory,
  dryRun: z.boolean().default(false),
});

export const SafetyPlanSchema = z.object({
  warningSigns: z.string().trim().max(1500).default(""),
  copingStrategies: z.string().trim().max(1500).default(""),
  peopleAndPlaces: z.string().trim().max(1500).default(""),
  reasonsForLiving: z.string().trim().max(1500).default(""),
  professionalContacts: z.string().trim().max(1500).default(""),
  makingSafe: z.string().trim().max(1500).default(""),
});

export const ReferralCreateSchema = z.object({
  clinicianId: id.nullable().optional(),
  resourceId: id.nullable().optional(),
  urgency: z.enum(["ROUTINE", "SOON", "URGENT"]),
  reason: z.string().trim().max(1000).nullable().optional(),
});

export const ReferralTransitionSchema = z.object({
  to: z.enum(["ACKNOWLEDGED", "SCHEDULED", "COMPLETED", "DECLINED", "CANCELLED", "UNABLE_TO_CONTACT"]),
  note: z.string().trim().max(500).nullable().optional(),
  scheduledFor: z.coerce.date().optional(),
});

export const ClinicianNoteSchema = z.object({ content: shortText(4000) });

export const FollowUpUpdateSchema = z.object({
  status: z.enum(["PLANNED", "COMPLETED", "MISSED", "CANCELLED"]),
  functioningChange: z.number().int().min(-2).max(2).nullable().optional(),
});

export const DeleteAccountSchema = z.object({
  confirmation: z.literal("DELETE", { message: 'Type "DELETE" to confirm' }),
});

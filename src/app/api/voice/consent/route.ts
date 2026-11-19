import { route } from "@/lib/http";
import { requirePatient } from "@/server/services/access.service";
import { grantVoiceConsent, voiceStatus } from "@/server/services/voice.service";

/** Voice Mode availability and consent state (no secrets, no model internals). */
export const GET = route({ roles: ["PATIENT"] }, async ({ actor }) => voiceStatus(requirePatient(actor)));

/** Explicit, revocable consent for voice processing (revoke under Profile & Privacy). */
export const POST = route({ roles: ["PATIENT"] }, async ({ actor }) => grantVoiceConsent(actor, requirePatient(actor)));

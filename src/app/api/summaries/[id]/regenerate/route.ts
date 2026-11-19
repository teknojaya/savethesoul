import { route, param } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { regenerateDraft } from "@/server/services/summary.service";

/** Clinician: regenerate the AI draft from the same patient-approved snapshot (never conversations). */
export const POST = route({ roles: ["CLINICIAN"] }, async ({ actor, params }) => {
  if (!rateLimit(`regenerate-draft:${actor.userId}`, 10, 60 * 60_000)) throw new AppError("RATE_LIMITED", "Please wait a little before regenerating again.");
  return { summary: await regenerateDraft(actor, param(params, "id")) };
});

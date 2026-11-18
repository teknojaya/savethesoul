import { route, param, parseJson } from "@/lib/http";
import { ReferralTransitionSchema } from "@/lib/validation/schemas";
import { transitionReferral } from "@/server/services/referral.service";

export const POST = route({ roles: ["PATIENT", "CLINICIAN"] }, async ({ req, actor, params }) => {
  const input = await parseJson(req, ReferralTransitionSchema);
  return {
    referral: await transitionReferral(actor, param(params, "id"), input.to, { note: input.note, scheduledFor: input.scheduledFor }),
  };
});

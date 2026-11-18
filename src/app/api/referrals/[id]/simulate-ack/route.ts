import { route, param } from "@/lib/http";
import { requirePatient } from "@/server/services/access.service";
import { simulateReferralAcknowledgement } from "@/server/services/referral.service";

/** DEMO_MODE only. Labelled SIMULATED in the referral history. */
export const POST = route({ roles: ["PATIENT"] }, async ({ actor, params }) => ({
  referral: await simulateReferralAcknowledgement(requirePatient(actor), param(params, "id")),
}));

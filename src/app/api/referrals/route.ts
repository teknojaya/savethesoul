import { route, parseJson } from "@/lib/http";
import { ReferralCreateSchema } from "@/lib/validation/schemas";
import { requirePatient } from "@/server/services/access.service";
import { createReferral, listClinicianReferrals, listPatientReferrals } from "@/server/services/referral.service";

export const GET = route({ roles: ["PATIENT", "CLINICIAN"] }, async ({ actor }) => ({
  referrals: actor.role === "PATIENT" ? await listPatientReferrals(requirePatient(actor)) : await listClinicianReferrals(actor),
}));

export const POST = route({ roles: ["PATIENT"] }, async ({ req, actor }) => {
  const input = await parseJson(req, ReferralCreateSchema);
  const r = await createReferral(requirePatient(actor), input);
  return { referral: { id: r.id, status: r.status, isSimulated: r.isSimulated } };
});

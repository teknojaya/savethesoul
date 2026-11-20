import { route, param, parseJson } from "@/lib/http";
import { CiPatientReviewSchema } from "@/lib/validation/schemas";
import { requirePatient } from "@/server/services/access.service";
import { patientReview } from "@/server/services/clinical-intelligence.service";

/** Patient corrects (removes items, adds a note) or approves an insight snapshot. */
export const POST = route({ roles: ["PATIENT"] }, async ({ req, actor, params }) => {
  const input = await parseJson(req, CiPatientReviewSchema);
  return patientReview(actor, requirePatient(actor), param(params, "id"), input);
});

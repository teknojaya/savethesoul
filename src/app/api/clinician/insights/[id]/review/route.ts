import { route, param, parseJson } from "@/lib/http";
import { CiClinicianReviewSchema } from "@/lib/validation/schemas";
import { clinicianReview } from "@/server/services/clinical-intelligence.service";

/** Clinician decision on a shared Clinical Insight (never turns it into a diagnosis). */
export const POST = route({ roles: ["CLINICIAN"] }, async ({ req, actor, params }) => {
  const input = await parseJson(req, CiClinicianReviewSchema);
  return { insight: await clinicianReview(actor, param(params, "id"), input) };
});

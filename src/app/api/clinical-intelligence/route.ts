import { route, parseJson } from "@/lib/http";
import { CiConsentSchema } from "@/lib/validation/schemas";
import { requirePatient } from "@/server/services/access.service";
import { getPatientInsights, setConsent } from "@/server/services/clinical-intelligence.service";

/** The patient's own Clinical Insights, wellbeing trends and consent state. */
export const GET = route({ roles: ["PATIENT"] }, async ({ actor }) => getPatientInsights(actor, requirePatient(actor)));

/** Grant or withdraw "Allow Sakinah to help understand my wellbeing" / care-plan support. */
export const POST = route({ roles: ["PATIENT"] }, async ({ req, actor }) => {
  const { scope, on } = await parseJson(req, CiConsentSchema);
  return setConsent(actor, requirePatient(actor), scope, on);
});

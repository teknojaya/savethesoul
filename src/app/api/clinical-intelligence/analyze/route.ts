import { route } from "@/lib/http";
import { requirePatient } from "@/server/services/access.service";
import { analyze, getPatientInsights } from "@/server/services/clinical-intelligence.service";

/** Patient asks Sakinah to update their insights now (idempotent; rate-limited). */
export const POST = route({ roles: ["PATIENT"] }, async ({ actor }) => {
  const patientId = requirePatient(actor);
  const result = await analyze(patientId, { trigger: "manual" });
  return { result, insights: await getPatientInsights(actor, patientId, { audited: false }) };
});

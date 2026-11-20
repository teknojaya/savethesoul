import { route, param, parseJson } from "@/lib/http";
import { ClinicianGoalSchema } from "@/lib/validation/schemas";
import { addClinicianGoal } from "@/server/services/clinical-intelligence.service";

/** Clinician adds a patient-facing follow-up goal (assigned clinicians only). */
export const POST = route({ roles: ["CLINICIAN"] }, async ({ req, actor, params }) => {
  const { title } = await parseJson(req, ClinicianGoalSchema);
  return { goal: await addClinicianGoal(actor, param(params, "id"), title) };
});

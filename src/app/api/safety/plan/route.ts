import { route, parseJson } from "@/lib/http";
import { SafetyPlanSchema } from "@/lib/validation/schemas";
import { requirePatient } from "@/server/services/access.service";
import { getSafetyPlan, saveSafetyPlan } from "@/server/services/safety.service";

export const GET = route({ roles: ["PATIENT"] }, async ({ actor }) => ({
  plan: await getSafetyPlan(requirePatient(actor)),
}));

export const PUT = route({ roles: ["PATIENT"] }, async ({ req, actor }) => {
  const input = await parseJson(req, SafetyPlanSchema);
  return { saved: await saveSafetyPlan(requirePatient(actor), input) };
});

import { route, param, parseJson } from "@/lib/http";
import { GoalUpdateSchema } from "@/lib/validation/schemas";
import { requirePatient } from "@/server/services/access.service";
import { updateGoal } from "@/server/services/wellbeing.service";

export const PATCH = route({ roles: ["PATIENT"] }, async ({ req, actor, params }) => {
  const { status } = await parseJson(req, GoalUpdateSchema);
  await updateGoal(requirePatient(actor), param(params, "id"), status);
  return { ok: true };
});

import { route, parseJson } from "@/lib/http";
import { GoalSchema } from "@/lib/validation/schemas";
import { requirePatient } from "@/server/services/access.service";
import { addGoal } from "@/server/services/wellbeing.service";

export const POST = route({ roles: ["PATIENT"] }, async ({ req, actor }) => {
  const { title } = await parseJson(req, GoalSchema);
  return { goal: await addGoal(requirePatient(actor), title) };
});

import { route, param, parseJson } from "@/lib/http";
import { FollowUpUpdateSchema } from "@/lib/validation/schemas";
import { updateFollowUp } from "@/server/services/clinician.service";

export const PATCH = route({ roles: ["CLINICIAN"] }, async ({ req, actor, params }) => {
  const input = await parseJson(req, FollowUpUpdateSchema);
  return { followUp: await updateFollowUp(actor, param(params, "id"), input) };
});

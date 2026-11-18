import { route, param, parseJson } from "@/lib/http";
import { NotifySchema } from "@/lib/validation/schemas";
import { requirePatient } from "@/server/services/access.service";
import { notifyContact } from "@/server/services/trusted-circle.service";

/** Preview (dryRun) or perform a SIMULATED notification. Never delivers real messages. */
export const POST = route({ roles: ["PATIENT"] }, async ({ req, actor, params }) => {
  const input = await parseJson(req, NotifySchema);
  return notifyContact(requirePatient(actor), param(params, "id"), input);
});

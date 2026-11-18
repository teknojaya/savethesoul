import { route, param } from "@/lib/http";
import { requirePatient } from "@/server/services/access.service";
import { deleteMemory } from "@/server/services/wellbeing.service";

export const DELETE = route({ roles: ["PATIENT"] }, async ({ actor, params }) => {
  await deleteMemory(requirePatient(actor), param(params, "id"));
  return { ok: true };
});

import { route, parseJson } from "@/lib/http";
import { PreferencesSchema } from "@/lib/validation/schemas";
import { updatePreferences } from "@/server/services/auth.service";
import { requirePatient } from "@/server/services/access.service";

export const PATCH = route({ roles: ["PATIENT"] }, async ({ req, actor }) => {
  const patientId = requirePatient(actor);
  const input = await parseJson(req, PreferencesSchema);
  await updatePreferences(patientId, input);
  return { ok: true };
});

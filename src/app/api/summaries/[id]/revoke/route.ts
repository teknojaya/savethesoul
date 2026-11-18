import { route, param } from "@/lib/http";
import { requirePatient } from "@/server/services/access.service";
import { stopSharingWithClinician } from "@/server/services/summary.service";

/** Patient stops sharing with the clinician this summary was shared with. */
export const POST = route({ roles: ["PATIENT"] }, async ({ actor, params }) => {
  await stopSharingWithClinician(requirePatient(actor), param(params, "id"));
  return { ok: true };
});

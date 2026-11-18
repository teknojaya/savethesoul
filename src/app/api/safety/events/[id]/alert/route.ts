import { route, param } from "@/lib/http";
import { requirePatient } from "@/server/services/access.service";
import { sendSimulatedCareTeamAlert } from "@/server/services/safety.service";

/** Patient-initiated SIMULATED alert to their care team. Never contacts real services. */
export const POST = route({ roles: ["PATIENT"] }, async ({ actor, params }) =>
  sendSimulatedCareTeamAlert(requirePatient(actor), param(params, "id")),
);

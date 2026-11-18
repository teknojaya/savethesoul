import { route, param } from "@/lib/http";
import { requirePatient } from "@/server/services/access.service";
import { simulateAcknowledgement } from "@/server/services/safety.service";

/** DEMO_MODE only: simulate a clinician acknowledging the alert. */
export const POST = route({ roles: ["PATIENT"] }, async ({ actor, params }) => ({
  event: await simulateAcknowledgement(requirePatient(actor), param(params, "id")),
}));

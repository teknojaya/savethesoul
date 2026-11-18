import { route, param } from "@/lib/http";
import { requirePatient } from "@/server/services/access.service";
import { getEventStatus } from "@/server/services/safety.service";

export const GET = route({ roles: ["PATIENT"] }, async ({ actor, params }) => ({
  event: await getEventStatus(requirePatient(actor), param(params, "id")),
}));

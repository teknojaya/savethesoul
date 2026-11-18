import { route, param } from "@/lib/http";
import { requirePatient } from "@/server/services/access.service";
import { revokeConsent } from "@/server/services/consent.service";

export const POST = route({ roles: ["PATIENT"] }, async ({ actor, params }) => ({
  consent: await revokeConsent(requirePatient(actor), param(params, "id")),
}));

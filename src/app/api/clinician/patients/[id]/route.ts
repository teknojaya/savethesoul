import { route, param } from "@/lib/http";
import { getPatientDetail } from "@/server/services/clinician.service";

export const GET = route({ roles: ["CLINICIAN"] }, async ({ actor, params }) => ({
  patient: await getPatientDetail(actor, param(params, "id")),
}));

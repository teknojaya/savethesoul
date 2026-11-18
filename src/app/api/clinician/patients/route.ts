import { route } from "@/lib/http";
import { listAssignedPatients } from "@/server/services/clinician.service";

export const GET = route({ roles: ["CLINICIAN"] }, async ({ actor }) => ({
  patients: await listAssignedPatients(actor),
}));

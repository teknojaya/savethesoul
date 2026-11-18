import { route } from "@/lib/http";
import { requirePatient } from "@/server/services/access.service";
import { listAccessToMyData } from "@/server/services/audit.service";

/** Lets patients see who accessed their information (transparency). */
export const GET = route({ roles: ["PATIENT"] }, async ({ actor }) => ({
  access: await listAccessToMyData(requirePatient(actor)),
}));

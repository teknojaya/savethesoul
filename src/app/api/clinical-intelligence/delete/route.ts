import { route } from "@/lib/http";
import { requirePatient } from "@/server/services/access.service";
import { deleteInsights } from "@/server/services/clinical-intelligence.service";

/** Patient deletes all of their derived Clinical Insights. */
export const POST = route({ roles: ["PATIENT"] }, async ({ actor }) => deleteInsights(actor, requirePatient(actor)));

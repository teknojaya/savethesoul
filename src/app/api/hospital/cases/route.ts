import { route } from "@/lib/http";
import { listCases } from "@/server/services/emergency.service";

/** Simulated emergency cases routed to the coordinator's organisation only. */
export const GET = route({ roles: ["HOSPITAL_COORDINATOR"] }, async ({ actor }) => listCases(actor));

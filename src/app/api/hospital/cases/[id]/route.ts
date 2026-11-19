import { route, param } from "@/lib/http";
import { getCase } from "@/server/services/emergency.service";

export const GET = route({ roles: ["HOSPITAL_COORDINATOR"] }, async ({ actor, params }) => ({ case: await getCase(actor, param(params, "id")) }));

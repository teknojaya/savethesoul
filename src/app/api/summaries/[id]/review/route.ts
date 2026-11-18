import { route, param } from "@/lib/http";
import { markDraftReviewed } from "@/server/services/summary.service";

/** Clinician acknowledges professional review of an AI-generated draft. */
export const POST = route({ roles: ["CLINICIAN"] }, async ({ actor, params }) => ({
  summary: await markDraftReviewed(actor, param(params, "id")),
}));

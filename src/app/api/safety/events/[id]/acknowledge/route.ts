import { route, param } from "@/lib/http";
import { acknowledgeAlert } from "@/server/services/safety.service";

export const POST = route({ roles: ["CLINICIAN"] }, async ({ actor, params }) => {
  const e = await acknowledgeAlert(actor, param(params, "id"));
  return { event: { id: e.id, workflowStatus: e.workflowStatus, acknowledgedAt: e.acknowledgedAt } };
});

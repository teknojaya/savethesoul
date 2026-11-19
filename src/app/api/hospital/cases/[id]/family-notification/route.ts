import { z } from "zod";
import { route, param, parseJson } from "@/lib/http";
import { recordFamilyNotification } from "@/server/services/emergency.service";

const Schema = z.object({ contactId: z.string().min(1).max(64) });

/** Records a SIMULATED trusted-contact message, only where the patient has authorised it. */
export const POST = route({ roles: ["HOSPITAL_COORDINATOR"] }, async ({ req, actor, params }) => {
  const { contactId } = await parseJson(req, Schema);
  return recordFamilyNotification(actor, param(params, "id"), contactId);
});

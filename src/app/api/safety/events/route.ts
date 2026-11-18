import { z } from "zod";
import { route, parseJson } from "@/lib/http";
import { requirePatient } from "@/server/services/access.service";
import { createSelfReportedEvent } from "@/server/services/safety.service";

const Schema = z.object({
  level: z.enum(["IMMEDIATE_DANGER", "ELEVATED_CONCERN"]),
  conversationId: z.string().max(64).optional(),
});

/** Patient self-reports their situation from the safety check-in card. */
export const POST = route({ roles: ["PATIENT"] }, async ({ req, actor }) => {
  const input = await parseJson(req, Schema);
  const e = await createSelfReportedEvent(requirePatient(actor), input.level, input.conversationId);
  return { safetyEventId: e.id };
});

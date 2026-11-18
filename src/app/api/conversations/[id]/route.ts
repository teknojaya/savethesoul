import { route, param } from "@/lib/http";
import { requirePatient } from "@/server/services/access.service";
import { deleteConversation, getConversation } from "@/server/services/conversation.service";

export const GET = route({ roles: ["PATIENT"] }, async ({ actor, params }) => ({
  conversation: await getConversation(requirePatient(actor), param(params, "id")),
}));

export const DELETE = route({ roles: ["PATIENT"] }, async ({ actor, params }) => {
  await deleteConversation(requirePatient(actor), param(params, "id"));
  return { ok: true };
});

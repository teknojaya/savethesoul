import { route } from "@/lib/http";
import { requirePatient } from "@/server/services/access.service";
import { deleteAllConversations, listConversations, startConversation } from "@/server/services/conversation.service";

export const GET = route({ roles: ["PATIENT"] }, async ({ actor }) => ({
  conversations: await listConversations(requirePatient(actor)),
}));

export const POST = route({ roles: ["PATIENT"] }, async ({ actor }) => {
  const c = await startConversation(requirePatient(actor));
  return { conversation: { id: c.id, ephemeral: c.ephemeral } };
});

export const DELETE = route({ roles: ["PATIENT"] }, async ({ actor }) => ({
  deleted: await deleteAllConversations(requirePatient(actor)),
}));

import { route, parseJson } from "@/lib/http";
import { MemorySchema } from "@/lib/validation/schemas";
import { requirePatient } from "@/server/services/access.service";
import { addMemory, listMemories } from "@/server/services/wellbeing.service";

export const GET = route({ roles: ["PATIENT"] }, async ({ actor }) => ({
  memories: await listMemories(requirePatient(actor)),
}));

export const POST = route({ roles: ["PATIENT"] }, async ({ req, actor }) => {
  const { content } = await parseJson(req, MemorySchema);
  return { memory: await addMemory(requirePatient(actor), content) };
});

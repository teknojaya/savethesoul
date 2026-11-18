import { route, param, parseJson } from "@/lib/http";
import { ClinicianNoteSchema } from "@/lib/validation/schemas";
import { addClinicianNote } from "@/server/services/clinician.service";

export const POST = route({ roles: ["CLINICIAN"] }, async ({ req, actor, params }) => {
  const { content } = await parseJson(req, ClinicianNoteSchema);
  return { note: await addClinicianNote(actor, param(params, "id"), content) };
});

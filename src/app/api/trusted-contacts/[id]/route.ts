import { route, param, parseJson } from "@/lib/http";
import { TrustedContactUpdateSchema } from "@/lib/validation/schemas";
import { requirePatient } from "@/server/services/access.service";
import { removeContact, updateContact } from "@/server/services/trusted-circle.service";

export const PATCH = route({ roles: ["PATIENT"] }, async ({ req, actor, params }) => {
  const input = await parseJson(req, TrustedContactUpdateSchema);
  return { contact: await updateContact(requirePatient(actor), param(params, "id"), input) };
});

export const DELETE = route({ roles: ["PATIENT"] }, async ({ actor, params }) => {
  await removeContact(requirePatient(actor), param(params, "id"));
  return { ok: true };
});

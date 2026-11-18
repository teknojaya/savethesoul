import { route, parseJson } from "@/lib/http";
import { TrustedContactSchema } from "@/lib/validation/schemas";
import { requirePatient } from "@/server/services/access.service";
import { addContact, listContacts } from "@/server/services/trusted-circle.service";

export const GET = route({ roles: ["PATIENT"] }, async ({ actor }) => ({
  contacts: await listContacts(requirePatient(actor)),
}));

export const POST = route({ roles: ["PATIENT"] }, async ({ req, actor }) => {
  const input = await parseJson(req, TrustedContactSchema);
  return { contact: await addContact(requirePatient(actor), input) };
});

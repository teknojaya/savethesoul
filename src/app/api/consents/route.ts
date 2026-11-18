import { route } from "@/lib/http";
import { requirePatient } from "@/server/services/access.service";
import { listConsents } from "@/server/services/consent.service";

export const GET = route({ roles: ["PATIENT"] }, async ({ actor }) => ({
  consents: await listConsents(requirePatient(actor)),
}));

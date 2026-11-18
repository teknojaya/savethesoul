import { route } from "@/lib/http";
import { requirePatient } from "@/server/services/access.service";
import { listNotifications } from "@/server/services/trusted-circle.service";

export const GET = route({ roles: ["PATIENT"] }, async ({ actor }) => ({
  notifications: await listNotifications(requirePatient(actor)),
}));

import { route } from "@/lib/http";
import { listFollowUps } from "@/server/services/clinician.service";

export const GET = route({ roles: ["CLINICIAN"] }, async ({ actor }) => ({
  followUps: await listFollowUps(actor),
}));

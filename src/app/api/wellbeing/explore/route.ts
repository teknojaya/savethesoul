import { route, parseJson } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { ExploreSchema } from "@/lib/validation/schemas";
import { exploreWellbeing } from "@/server/services/explore.service";
import { requirePatient } from "@/server/services/access.service";

/** AI-assisted preliminary exploration (not a diagnosis). Nothing is stored. */
export const POST = route({ roles: ["PATIENT"] }, async ({ req, actor }) => {
  const input = await parseJson(req, ExploreSchema);
  if (!rateLimit(`explore:${actor.userId}`, 6, 60 * 60_000)) throw new AppError("RATE_LIMITED", "Please wait a little before exploring again.");
  return exploreWellbeing({ ...actor, patientId: requirePatient(actor) }, input);
});

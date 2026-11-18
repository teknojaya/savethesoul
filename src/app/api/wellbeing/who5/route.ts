import { route, parseJson } from "@/lib/http";
import { Who5Schema } from "@/lib/validation/schemas";
import { requirePatient } from "@/server/services/access.service";
import { listAssessments, submitWho5 } from "@/server/services/wellbeing.service";

export const GET = route({ roles: ["PATIENT"] }, async ({ actor }) => ({
  assessments: await listAssessments(requirePatient(actor)),
}));

export const POST = route({ roles: ["PATIENT"] }, async ({ req, actor }) => {
  const { answers } = await parseJson(req, Who5Schema);
  return submitWho5(requirePatient(actor), answers);
});

import { route, parseJson } from "@/lib/http";
import { OnboardingSchema } from "@/lib/validation/schemas";
import { completeOnboarding } from "@/server/services/auth.service";
import { requirePatient } from "@/server/services/access.service";

export const POST = route({ roles: ["PATIENT"] }, async ({ req, actor }) => {
  const patientId = requirePatient(actor);
  const input = await parseJson(req, OnboardingSchema);
  await completeOnboarding(patientId, input);
  return { ok: true, redirectTo: "/patient" };
});

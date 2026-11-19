import { route, parseJson } from "@/lib/http";
import { SummaryShareSchema } from "@/lib/validation/schemas";
import { requirePatient } from "@/server/services/access.service";
import { listPatientSummaries, shareSummary } from "@/server/services/summary.service";

export const GET = route({ roles: ["PATIENT"] }, async ({ actor }) => ({
  summaries: await listPatientSummaries(requirePatient(actor)),
}));

/** Shares a summary the patient has previewed and explicitly confirmed. */
export const POST = route({ roles: ["PATIENT"] }, async ({ req, actor }) => {
  const input = await parseJson(req, SummaryShareSchema);
  return { summary: await shareSummary(requirePatient(actor), input.clinicianId, input.categories, input.patientNote, input.reportedConcerns) };
});

import { route, parseJson } from "@/lib/http";
import { SummaryPreviewSchema } from "@/lib/validation/schemas";
import { requirePatient } from "@/server/services/access.service";
import { previewSummary } from "@/server/services/summary.service";

/** Builds exactly what would be shared, without sharing anything. */
export const POST = route({ roles: ["PATIENT"] }, async ({ req, actor }) => {
  const input = await parseJson(req, SummaryPreviewSchema);
  return { preview: await previewSummary(requirePatient(actor), input.clinicianId, input.categories, input.patientNote, input.reportedConcerns) };
});

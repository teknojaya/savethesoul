import { route, param, parseJson } from "@/lib/http";
import { ClinicianFindingSchema } from "@/lib/validation/schemas";
import { addFinding, listFindings } from "@/server/services/findings.service";

/** Clinician-confirmed findings for an assigned, consenting patient (clinicians only). */
export const GET = route({ roles: ["CLINICIAN"] }, async ({ actor, params }) => ({
  findings: await listFindings(actor, param(params, "id")),
}));

export const POST = route({ roles: ["CLINICIAN"] }, async ({ req, actor, params }) => {
  const input = await parseJson(req, ClinicianFindingSchema);
  return { finding: await addFinding(actor, param(params, "id"), input) };
});

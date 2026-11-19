import { route, param } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { DraftReviewSchema } from "@/lib/validation/schemas";
import { reviewDraft } from "@/server/services/summary.service";

/**
 * Clinician decision on an AI-generated draft: APPROVED, CORRECTED (with corrected text),
 * REJECTED, or the legacy REVIEWED acknowledgement (default when no body is sent).
 */
export const POST = route({ roles: ["CLINICIAN"] }, async ({ req, actor, params }) => {
  const raw = await req.text();
  let body: unknown = {};
  try {
    if (raw.trim()) body = JSON.parse(raw);
  } catch {
    throw new AppError("VALIDATION", "Request body must be valid JSON");
  }
  const input = DraftReviewSchema.parse(body);
  return { summary: await reviewDraft(actor, param(params, "id"), input) };
});

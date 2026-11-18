import { route } from "@/lib/http";
import { getOutcomeMetrics } from "@/server/services/analytics.service";

export const GET = route({ roles: ["CLINICIAN", "ADMIN"] }, async ({ actor }) => ({
  metrics: await getOutcomeMetrics(actor),
}));

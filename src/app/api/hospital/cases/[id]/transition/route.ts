import { z } from "zod";
import { route, param, parseJson } from "@/lib/http";
import { EMERGENCY_STATUSES } from "@/features/emergency/state-machine";
import { transitionCase } from "@/server/services/emergency.service";

const Schema = z.object({ to: z.enum(EMERGENCY_STATUSES), note: z.string().trim().max(1000).nullable().optional() });

/** Validated, audited, SIMULATED response step. */
export const POST = route({ roles: ["HOSPITAL_COORDINATOR"] }, async ({ req, actor, params }) => {
  const { to, note } = await parseJson(req, Schema);
  return { case: await transitionCase(actor, param(params, "id"), to, note) };
});

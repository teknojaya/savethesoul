import { NextResponse } from "next/server";
import { route, parseJson } from "@/lib/http";
import { DeleteAccountSchema } from "@/lib/validation/schemas";
import { requirePatient } from "@/server/services/access.service";
import { deletePatientAccount } from "@/server/services/privacy.service";
import { clearSessionCookie } from "@/lib/auth/cookies";

export const POST = route({ roles: ["PATIENT"] }, async ({ req, actor }) => {
  await parseJson(req, DeleteAccountSchema);
  const patientId = requirePatient(actor);
  await deletePatientAccount({ ...actor, patientId });
  const res = NextResponse.json({ ok: true, redirectTo: "/" });
  clearSessionCookie(res);
  return res;
});

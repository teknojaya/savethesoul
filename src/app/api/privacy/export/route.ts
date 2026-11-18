import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { requirePatient } from "@/server/services/access.service";
import { exportPatientData } from "@/server/services/privacy.service";

export const GET = route({ roles: ["PATIENT"] }, async ({ actor }) => {
  const patientId = requirePatient(actor);
  const data = await exportPatientData({ ...actor, patientId });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="savethesoul-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
});

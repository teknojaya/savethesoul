import { route, parseJson } from "@/lib/http";
import { CheckInSchema } from "@/lib/validation/schemas";
import { requirePatient } from "@/server/services/access.service";
import { addCheckIn, listCheckIns } from "@/server/services/wellbeing.service";
import { assessMessage } from "@/features/safety/classifier";

export const GET = route({ roles: ["PATIENT"] }, async ({ actor }) => ({
  checkIns: await listCheckIns(requirePatient(actor)),
}));

export const POST = route({ roles: ["PATIENT"] }, async ({ req, actor }) => {
  const input = await parseJson(req, CheckInSchema);
  const checkIn = await addCheckIn(requirePatient(actor), input);
  // Notes are screened by the same safety rules so the UI can offer help.
  // No event is stored and nobody is notified: it is shown to the user only.
  const safety = input.note ? assessMessage(input.note) : null;
  return { checkIn, safety: safety && safety.level !== "NO_FLAG" ? { level: safety.level } : null };
});

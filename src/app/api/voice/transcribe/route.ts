import { route } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { MAX_AUDIO_BYTES, MAX_RECORDING_SECONDS } from "@/features/voice/audio-validation";
import { requirePatient } from "@/server/services/access.service";
import { transcribeRecording } from "@/server/services/voice.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Multipart upload with one field, "audio". Returns { transcript } for the patient to review. */
export const POST = route({ roles: ["PATIENT"] }, async ({ req, actor }) => {
  const patientId = requirePatient(actor);
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_AUDIO_BYTES + 64 * 1024) throw new AppError("PAYLOAD_TOO_LARGE", `Recordings can be up to ${MAX_RECORDING_SECONDS} seconds.`);
  if (!rateLimit(`voice-stt:${actor.userId}`, 20, 60_000)) {
    throw new AppError("RATE_LIMITED", "You're recording very quickly. Please pause for a moment, or type instead.");
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new AppError("VALIDATION", "Expected an audio recording.");
  }
  const audio = form.get("audio");
  if (!(audio instanceof File)) throw new AppError("VALIDATION", "Expected an audio recording.");
  return transcribeRecording(patientId, audio);
});

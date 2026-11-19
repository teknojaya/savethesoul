import { z } from "zod";
import { route, parseJson } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { requirePatient } from "@/server/services/access.service";
import { speakMessage } from "@/server/services/voice.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SpeechSchema = z.object({ messageId: z.string().min(1).max(64), part: z.number().int().min(0).max(1).default(0) });

/**
 * Returns MP3 audio of one of Sakinah's saved replies. Only a message id is accepted, never free
 * text. Replies are spoken in up to two parts (a short opening, then the rest) so playback can
 * start quickly; 204 means the reply has no such part.
 */
export const POST = route({ roles: ["PATIENT"] }, async ({ req, actor }) => {
  const patientId = requirePatient(actor);
  const { messageId, part } = await parseJson(req, SpeechSchema);
  if (!rateLimit(`voice-tts:${actor.userId}`, 40, 60_000)) {
    throw new AppError("RATE_LIMITED", "Please wait a moment before replaying again.");
  }
  const { audio, parts } = await speakMessage(patientId, messageId, part);
  if (!audio) return new Response(null, { status: 204, headers: { "X-Speech-Parts": String(parts), "Cache-Control": "no-store" } });
  return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, no-store", "X-Speech-Parts": String(parts) } });
});

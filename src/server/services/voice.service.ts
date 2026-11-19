import { prisma } from "@/lib/db/prisma";
import { decrypt } from "@/lib/crypto";
import { AppError, notFound } from "@/lib/errors";
import type { Actor } from "@/lib/auth/session";
import { POLICY_VERSION } from "@/features/consent/policy";
import { checkAudio, MAX_AUDIO_BYTES, MAX_RECORDING_SECONDS } from "@/features/voice/audio-validation";
import { splitForSpeech, toSpeakableText } from "@/features/voice/speech-text";
import { getVoiceProvider, VoiceError } from "@/features/voice/voice-provider";
import { audit, recordSystemEvent } from "./audit.service";
import { hasAiProcessingConsent } from "./consent.service";

/** Max characters kept from one transcript (same limit as a typed message). */
const MAX_TRANSCRIPT_CHARS = 4000;

async function hasVoiceConsent(patientId: string) {
  const c = await prisma.consentRecord.findFirst({ where: { patientId, scope: "VOICE_PROCESSING", revokedAt: null }, select: { id: true } });
  return c !== null;
}

export async function voiceStatus(patientId: string) {
  const provider = getVoiceProvider();
  return {
    available: provider !== null,
    consented: await hasVoiceConsent(patientId),
    limits: { maxSeconds: MAX_RECORDING_SECONDS, maxBytes: MAX_AUDIO_BYTES },
  };
}

/** Records the patient's explicit consent to send voice recordings and replies through the audio provider. */
export async function grantVoiceConsent(actor: Actor, patientId: string) {
  if (!(await hasVoiceConsent(patientId))) {
    const c = await prisma.consentRecord.create({ data: { patientId, scope: "VOICE_PROCESSING", categories: [], policyVersion: POLICY_VERSION } });
    await audit(actor, { action: "CONSENT_GRANTED_VOICE", resourceType: "ConsentRecord", resourceId: c.id, subjectPatientId: patientId });
  }
  return voiceStatus(patientId);
}

async function assertVoiceAllowed(patientId: string) {
  const provider = getVoiceProvider();
  if (!provider) throw new AppError("UNAVAILABLE", "Voice isn't available right now. You can keep chatting by text.");
  if (!(await hasAiProcessingConsent(patientId))) throw new AppError("CONSENT_REQUIRED", "The companion needs your AI-processing consent (Profile & Privacy).");
  if (!(await hasVoiceConsent(patientId))) throw new AppError("CONSENT_REQUIRED", "Please agree to voice processing before using Voice Mode.");
  return provider;
}

function voiceFailure(err: unknown, what: "STT" | "TTS"): never {
  const code = err instanceof VoiceError ? err.code : "UNKNOWN";
  void recordSystemEvent("VOICE_ERROR", `${what}_${code}`);
  if (code === "EMPTY") throw new AppError("VALIDATION", "I couldn't hear any speech in that recording. Please try again, or type instead.");
  if (code === "RATE_LIMITED") throw new AppError("RATE_LIMITED", "Voice is busy right now. Please try again in a moment, or type instead.");
  throw new AppError("UNAVAILABLE", what === "STT" ? "I couldn't transcribe that just now. Please try again, or type instead." : "Sakinah's voice isn't available just now. The reply is shown as text.");
}

/**
 * Transcribes one push-to-talk recording. The audio is held in memory only for this request
 * and is never stored or logged; the transcript is returned to the patient for review and is
 * only saved if they send it as a chat message (through the normal, safety-checked chat route).
 */
export async function transcribeRecording(patientId: string, file: File) {
  const provider = await assertVoiceAllowed(patientId);
  if (file.size > MAX_AUDIO_BYTES) throw new AppError("PAYLOAD_TOO_LARGE", `Recordings can be up to ${MAX_RECORDING_SECONDS} seconds.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkAudio(file.type, bytes);
  if (!check.ok) {
    if (check.reason === "TOO_LARGE") throw new AppError("PAYLOAD_TOO_LARGE", `Recordings can be up to ${MAX_RECORDING_SECONDS} seconds.`);
    if (check.reason === "TOO_SHORT") throw new AppError("VALIDATION", "That recording was too short. Hold on a little longer, or type instead.");
    throw new AppError("UNSUPPORTED_MEDIA", "This audio format isn't supported. Please try another browser, or type instead.");
  }
  try {
    const text = await provider.transcribe({ bytes, filename: `recording.${check.extension}`, mime: check.mime });
    return { transcript: text.slice(0, MAX_TRANSCRIPT_CHARS) };
  } catch (err) {
    voiceFailure(err, "STT");
  } finally {
    bytes.fill(0);
  }
}

/**
 * Speaks a reply that is already saved in the patient's own conversation. Only assistant and
 * safety messages can be spoken, so the voice can never say anything that did not pass the
 * Safety Guardian and output guard; arbitrary text is not accepted.
 */
export async function speakMessage(patientId: string, messageId: string, part = 0): Promise<{ audio: ArrayBuffer | null; parts: number }> {
  const provider = await assertVoiceAllowed(patientId);
  const msg = await prisma.chatMessage.findFirst({
    where: { id: messageId, conversation: { patientId } },
    select: { role: true, contentEnc: true },
  });
  if (!msg) throw notFound("Message not found");
  if (msg.role === "USER") throw new AppError("VALIDATION", "Only Sakinah's replies can be spoken.");
  const parts = splitForSpeech(toSpeakableText(decrypt(msg.contentEnc)));
  if (!parts.length) throw new AppError("VALIDATION", "Nothing to speak.");
  if (part >= parts.length) return { audio: null, parts: parts.length };
  try {
    return { audio: await provider.speak(parts[part]), parts: parts.length };
  } catch (err) {
    voiceFailure(err, "TTS");
  }
}

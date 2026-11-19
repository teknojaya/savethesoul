import "server-only";
import OpenAI, { toFile } from "openai";
import { getEnv } from "@/lib/env";
import { SAKINAH_VOICE_INSTRUCTIONS } from "./sakinah";

export class VoiceError extends Error {
  constructor(
    readonly code: "TIMEOUT" | "UNAVAILABLE" | "RATE_LIMITED" | "CONFIG" | "EMPTY",
    message: string,
  ) {
    super(message);
    this.name = "VoiceError";
  }
}

export interface VoiceProvider {
  readonly id: string;
  readonly sttModel: string;
  readonly ttsModel: string;
  /** Returns the transcript; throws VoiceError. The audio is never stored. */
  transcribe(audio: { bytes: Uint8Array; filename: string; mime: string }): Promise<string>;
  /** Returns MP3 audio for already safety-checked text; throws VoiceError. */
  speak(text: string): Promise<ArrayBuffer>;
}

/** OpenAI speech-to-text and text-to-speech (server-side only; the key never reaches the browser). */
export class OpenAIVoiceProvider implements VoiceProvider {
  readonly id = "openai";
  private client: OpenAI;

  constructor(
    apiKey: string,
    readonly sttModel: string,
    readonly ttsModel: string,
    private voice: string,
    private language: string,
    timeoutMs: number,
    client?: OpenAI,
  ) {
    this.client = client ?? new OpenAI({ apiKey, timeout: timeoutMs, maxRetries: 1 });
  }

  async transcribe(audio: { bytes: Uint8Array; filename: string; mime: string }): Promise<string> {
    try {
      const file = await toFile(audio.bytes, audio.filename, { type: audio.mime });
      const res = await this.client.audio.transcriptions.create({
        file,
        model: this.sttModel,
        language: this.language,
        response_format: "json",
      });
      const text = (res.text ?? "").trim();
      if (!text) throw new VoiceError("EMPTY", "No speech recognised");
      return text;
    } catch (err) {
      throw mapError(err);
    }
  }

  async speak(text: string): Promise<ArrayBuffer> {
    try {
      const res = await this.client.audio.speech.create({
        model: this.ttsModel,
        voice: this.voice,
        input: text,
        response_format: "mp3",
        // Only the newer TTS models accept delivery instructions.
        ...(this.ttsModel.startsWith("gpt-") ? { instructions: SAKINAH_VOICE_INSTRUCTIONS } : {}),
      });
      return await res.arrayBuffer();
    } catch (err) {
      throw mapError(err);
    }
  }
}

function mapError(err: unknown): VoiceError {
  if (err instanceof VoiceError) return err;
  if (err instanceof OpenAI.APIConnectionTimeoutError || err instanceof OpenAI.APIUserAbortError) return new VoiceError("TIMEOUT", "Voice request timed out");
  if (err instanceof OpenAI.RateLimitError) return new VoiceError("RATE_LIMITED", "Voice provider rate limited");
  if (err instanceof OpenAI.AuthenticationError || err instanceof OpenAI.PermissionDeniedError || err instanceof OpenAI.NotFoundError || err instanceof OpenAI.BadRequestError) {
    return new VoiceError("CONFIG", "Voice request rejected by provider");
  }
  return new VoiceError("UNAVAILABLE", "Voice provider unavailable");
}

let override: VoiceProvider | null | undefined;

/** Test hook. Pass `null` to simulate "voice not configured". */
export function setVoiceProviderOverride(p: VoiceProvider | null | undefined) {
  override = p;
}

/** Voice needs OpenAI (the only supported audio provider); otherwise Voice Mode is unavailable. */
export function getVoiceProvider(): VoiceProvider | null {
  if (override !== undefined) return override;
  const env = getEnv();
  if (!env.OPENAI_API_KEY || env.LLM_PROVIDER === "demo") return null;
  return new OpenAIVoiceProvider(env.OPENAI_API_KEY, env.VOICE_STT_MODEL, env.VOICE_TTS_MODEL, env.VOICE_TTS_VOICE, env.VOICE_LANGUAGE, env.VOICE_TIMEOUT_MS);
}

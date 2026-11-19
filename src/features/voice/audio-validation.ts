/**
 * Upload limits and format checks for Voice Mode recordings. The browser chooses the
 * container (Chrome/Android: WebM/Opus; Safari/iOS: MP4/AAC), so the server checks both the
 * declared type and the file's own signature before anything is sent to the provider.
 */
export const MAX_RECORDING_SECONDS = 60;
/** About 60 s of compressed speech in any supported container fits comfortably. */
export const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
export const MIN_AUDIO_BYTES = 1024;

export type AudioContainer = "webm" | "mp4" | "ogg" | "wav" | "mp3";

const DECLARED: Record<string, AudioContainer[]> = {
  "audio/webm": ["webm"],
  "video/webm": ["webm"],
  "audio/mp4": ["mp4"],
  "video/mp4": ["mp4"],
  "audio/x-m4a": ["mp4"],
  "audio/m4a": ["mp4"],
  "audio/aac": ["mp4"],
  "audio/ogg": ["ogg"],
  "audio/wav": ["wav"],
  "audio/x-wav": ["wav"],
  "audio/wave": ["wav"],
  "audio/mpeg": ["mp3"],
  "audio/mp3": ["mp3"],
};

/** File extension the speech-to-text API uses to pick a decoder. */
export const EXTENSION: Record<AudioContainer, string> = { webm: "webm", mp4: "m4a", ogg: "ogg", wav: "wav", mp3: "mp3" };

export function sniffContainer(b: Uint8Array): AudioContainer | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "webm";
  if (b.length >= 12 && ascii(4, 8) === "ftyp") return "mp4";
  if (b.length >= 4 && ascii(0, 4) === "OggS") return "ogg";
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return "wav";
  if (b.length >= 3 && (ascii(0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0))) return "mp3";
  return null;
}

export type AudioCheck =
  | { ok: true; container: AudioContainer; extension: string; mime: string }
  | { ok: false; reason: "TOO_LARGE" | "TOO_SHORT" | "UNSUPPORTED" };

export function checkAudio(declaredType: string, bytes: Uint8Array): AudioCheck {
  if (bytes.length > MAX_AUDIO_BYTES) return { ok: false, reason: "TOO_LARGE" };
  if (bytes.length < MIN_AUDIO_BYTES) return { ok: false, reason: "TOO_SHORT" };
  const base = declaredType.split(";")[0].trim().toLowerCase();
  const allowed = DECLARED[base];
  const container = sniffContainer(bytes);
  if (!allowed || !container || !allowed.includes(container)) return { ok: false, reason: "UNSUPPORTED" };
  return { ok: true, container, extension: EXTENSION[container], mime: base };
}

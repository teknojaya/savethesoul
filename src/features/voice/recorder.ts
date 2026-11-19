import { MAX_RECORDING_SECONDS } from "./audio-validation";

/** Preferred recording formats, in order. Chrome/Android: WebM/Opus. Safari/iOS: MP4/AAC. */
export const RECORDER_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/ogg;codecs=opus",
] as const;

export function pickRecorderMimeType(isTypeSupported: (type: string) => boolean): string | null {
  for (const t of RECORDER_MIME_CANDIDATES) {
    try {
      if (isTypeSupported(t)) return t;
    } catch {
      /* some browsers throw for unknown types */
    }
  }
  return null;
}

export type VoiceSupport = { ok: true; mimeType: string | null } | { ok: false; reason: string };

/** Feature detection only. It never opens the microphone. */
export function detectVoiceSupport(): VoiceSupport {
  if (typeof window === "undefined") return { ok: false, reason: "Voice needs a browser." };
  if (!window.isSecureContext) return { ok: false, reason: "Voice needs a secure (https) connection." };
  if (!navigator.mediaDevices?.getUserMedia) return { ok: false, reason: "This browser can't record audio. You can keep chatting by text." };
  if (typeof window.MediaRecorder === "undefined") return { ok: false, reason: "This browser can't record audio. Please update it, or keep chatting by text." };
  const mimeType = typeof MediaRecorder.isTypeSupported === "function" ? pickRecorderMimeType((t) => MediaRecorder.isTypeSupported(t)) : null;
  return { ok: true, mimeType };
}

/** Maps getUserMedia / MediaRecorder failures to plain-language messages. */
export function microphoneErrorMessage(err: unknown): string {
  const name = err instanceof DOMException || err instanceof Error ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Microphone access is blocked. Allow it in your browser's site settings, or keep chatting by text.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No microphone was found. Check your device, or keep chatting by text.";
  if (name === "NotReadableError") return "Your microphone is being used by another app. Close it and try again, or type instead.";
  return "The microphone couldn't start. Please try again, or keep chatting by text.";
}

export interface Recording {
  blob: Blob;
  mimeType: string;
  seconds: number;
}

/**
 * One push-to-talk recording. The microphone is opened by start() (always from a user tap),
 * and every exit path (stop, cancel, auto-stop at the time limit, page hidden) releases it.
 */
export class PushToTalkRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private limitTimer: ReturnType<typeof setTimeout> | null = null;
  private levelTimer: ReturnType<typeof setInterval> | null = null;
  private audioCtx: AudioContext | null = null;
  private stopResolver: ((r: Recording | null) => void) | null = null;
  private cancelled = false;

  constructor(
    private mimeType: string | null,
    private onLevel: (level: number) => void,
    private onAutoStop: () => void,
  ) {}

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    this.chunks = [];
    this.cancelled = false;
    this.recorder = new MediaRecorder(this.stream, this.mimeType ? { mimeType: this.mimeType } : undefined);
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.onstop = () => {
      const type = this.recorder?.mimeType || this.mimeType || "audio/webm";
      const result = this.cancelled ? null : { blob: new Blob(this.chunks, { type }), mimeType: type, seconds: (Date.now() - this.startedAt) / 1000 };
      this.chunks = [];
      this.release();
      this.stopResolver?.(result);
      this.stopResolver = null;
    };
    this.recorder.start(250);
    this.startedAt = Date.now();
    this.limitTimer = setTimeout(() => this.onAutoStop(), MAX_RECORDING_SECONDS * 1000);
    this.meter();
  }

  /** Stops and returns the recording (null if it was cancelled or never started). */
  stop(): Promise<Recording | null> {
    if (!this.recorder || this.recorder.state === "inactive") {
      this.release();
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      this.stopResolver = resolve;
      this.recorder!.stop();
    });
  }

  /** Stops and discards everything. Safe to call at any time. */
  cancel(): void {
    this.cancelled = true;
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    else this.release();
  }

  private meter() {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx || !this.stream) return;
      this.audioCtx = new Ctx();
      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 256;
      this.audioCtx.createMediaStreamSource(this.stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      this.levelTimer = setInterval(() => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
        this.onLevel(Math.min(1, peak / 64));
      }, 80);
    } catch {
      /* the level meter is decorative */
    }
  }

  private release() {
    if (this.limitTimer) clearTimeout(this.limitTimer);
    if (this.levelTimer) clearInterval(this.levelTimer);
    this.limitTimer = this.levelTimer = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.audioCtx?.close().catch(() => {});
    this.audioCtx = null;
    this.onLevel(0);
  }
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, RotateCcw, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { detectVoiceSupport, microphoneErrorMessage, PushToTalkRecorder } from "@/features/voice/recorder";
import { MAX_RECORDING_SECONDS, MIN_AUDIO_BYTES } from "@/features/voice/audio-validation";

type MicState = "idle" | "consent" | "recording" | "transcribing" | "error";

export interface VoiceAvailability {
  available: boolean;
  consented: boolean;
}

/**
 * Microphone beside the message box (push-to-talk). Reuses the Voice Mode recorder, consent and
 * transcription endpoints. The transcript is placed in the message box for the user to review
 * and edit; nothing is sent until they tap Send, through the normal safety-checked chat route.
 */
export function ComposerMic({
  disabled,
  voice,
  onVoiceChange,
  onTranscript,
  onBeforeRecord,
}: {
  disabled?: boolean;
  voice: VoiceAvailability | null;
  onVoiceChange: (v: VoiceAvailability) => void;
  onTranscript: (text: string) => void;
  onBeforeRecord?: () => void;
}) {
  const [state, setState] = useState<MicState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [agree, setAgree] = useState(false);
  const recorder = useRef<PushToTalkRecorder | null>(null);
  const upload = useRef<AbortController | null>(null);
  const live = useRef<MicState>("idle");
  const go = (s: MicState) => {
    live.current = s;
    setState(s);
  };

  useEffect(() => {
    if (state !== "recording") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [state]);

  // Never record in the background, and always release the microphone on unmount.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden" && (live.current === "recording" || live.current === "transcribing")) cancel();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      recorder.current?.cancel();
      upload.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- set up once
  }, []);

  function fail(message: string) {
    setError(message);
    go("error");
  }

  async function start(consentJustGiven = false) {
    setError(null);
    if (voice && !voice.available) return fail("Voice isn't available right now. You can keep typing.");
    if (!voice?.consented && !consentJustGiven) {
      go("consent");
      return;
    }
    const support = detectVoiceSupport();
    if (!support.ok) return fail(support.reason);
    onBeforeRecord?.();
    recorder.current?.cancel();
    const rec = new PushToTalkRecorder(support.mimeType, () => {}, () => void stop());
    recorder.current = rec;
    setSeconds(0);
    go("recording");
    try {
      await rec.start();
    } catch (err) {
      rec.cancel();
      recorder.current = null;
      fail(microphoneErrorMessage(err));
    }
  }

  async function giveConsent() {
    const res = await fetch("/api/voice/consent", { method: "POST" }).catch(() => null);
    if (!res?.ok) return fail("Couldn't save your choice. Please try again, or keep typing.");
    onVoiceChange(await res.json());
    void start(true);
  }

  async function stop() {
    const rec = recorder.current;
    if (!rec || live.current !== "recording") return;
    go("transcribing");
    const recording = await rec.stop();
    recorder.current = null;
    if (!recording) return;
    if (recording.seconds < 0.6 || recording.blob.size < MIN_AUDIO_BYTES) return fail("That was very short. Tap the microphone and speak a little longer.");
    const controller = new AbortController();
    upload.current = controller;
    try {
      const form = new FormData();
      const ext = recording.mimeType.includes("mp4") ? "m4a" : recording.mimeType.includes("ogg") ? "ogg" : "webm";
      form.append("audio", recording.blob, `voice.${ext}`);
      const res = await fetch("/api/voice/transcribe", { method: "POST", body: form, signal: controller.signal });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? "I couldn't transcribe that just now. Please try again, or type instead.");
      go("idle");
      onTranscript(String(body.transcript ?? ""));
    } catch (e) {
      if (!controller.signal.aborted) fail(e instanceof Error ? e.message : "I couldn't transcribe that just now.");
    } finally {
      if (upload.current === controller) upload.current = null;
    }
  }

  function cancel() {
    recorder.current?.cancel();
    recorder.current = null;
    upload.current?.abort();
    upload.current = null;
    go("idle");
  }

  const recording = state === "recording";
  const transcribing = state === "transcribing";

  return (
    <>
      {state !== "idle" && (
        <div className="absolute inset-x-0 bottom-full mb-2 flex justify-center px-1" data-testid="composer-mic-panel">
          <div role="status" aria-live="polite" className="flex w-full max-w-2xl flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2 text-sm shadow-lift">
            {recording && (
              <>
                <span className="inline-flex items-center gap-2 font-medium text-safety-700">
                  <span className="size-2.5 rounded-full bg-safety-500 motion-safe:animate-pulse" aria-hidden /> Listening…
                </span>
                <span className="tabular-nums text-muted">
                  {seconds}s / {MAX_RECORDING_SECONDS}s
                </span>
                <span className="flex-1" />
                <Button size="sm" variant="ghost" onClick={cancel} data-testid="composer-mic-cancel">
                  <X aria-hidden /> Cancel
                </Button>
              </>
            )}
            {transcribing && (
              <>
                <Loader2 className="size-4 animate-spin text-brand-700" aria-hidden /> <span>Transcribing…</span>
                <span className="flex-1" />
                <Button size="sm" variant="ghost" onClick={cancel} data-testid="composer-mic-cancel">
                  <X aria-hidden /> Cancel
                </Button>
              </>
            )}
            {state === "consent" && (
              <div className="flex w-full flex-col gap-2" data-testid="composer-mic-consent">
                <label className="flex items-start gap-2 text-xs text-ink-soft">
                  <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                  <span>
                    I agree that my voice recordings are sent from SaveTheSoul&apos;s server to OpenAI to be transcribed, and that Sakinah&apos;s replies may be read aloud using OpenAI
                    text-to-speech. Recordings aren&apos;t stored. I can turn this off in Profile &amp; Privacy.
                  </span>
                </label>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => go("idle")}>
                    Not now
                  </Button>
                  <Button size="sm" disabled={!agree} onClick={giveConsent} data-testid="composer-mic-agree">
                    Agree
                  </Button>
                </div>
              </div>
            )}
            {state === "error" && (
              <>
                <span className="flex-1 text-safety-700" data-testid="composer-mic-error">
                  {error}
                </span>
                <Button size="sm" variant="secondary" onClick={() => start()} data-testid="composer-mic-retry">
                  <RotateCcw aria-hidden /> Try again
                </Button>
                <Button size="sm" variant="ghost" onClick={() => go("idle")} aria-label="Dismiss">
                  <X aria-hidden />
                </Button>
              </>
            )}
          </div>
        </div>
      )}
      <Button
        type="button"
        size="icon"
        variant={recording ? "primary" : "secondary"}
        onClick={recording ? stop : transcribing ? cancel : () => start()}
        disabled={disabled && !recording}
        aria-label={recording ? "Stop recording" : transcribing ? "Cancel transcription" : "Speak your message"}
        aria-pressed={recording}
        title={recording ? "Stop recording" : "Speak your message"}
        data-testid="composer-mic"
        className={cn("size-11 shrink-0", recording && "bg-safety-600 text-white hover:bg-safety-700")}
      >
        {recording ? <Square /> : transcribing ? <Loader2 className="animate-spin" /> : <Mic />}
      </Button>
    </>
  );
}

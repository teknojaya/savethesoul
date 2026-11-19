"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { Keyboard, LifeBuoy, Loader2, Mic, PhoneOff, RotateCcw, Send, Square, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { initialVoiceState, STATUS_LABEL, voiceReducer, type VoiceEvent, type VoiceStatus } from "@/features/voice/voice-state";
import { detectVoiceSupport, microphoneErrorMessage, PushToTalkRecorder } from "@/features/voice/recorder";
import { SAKINAH_NAME, SAKINAH_NON_AFFILIATION, SAKINAH_SUBTITLE, SAKINAH_WELCOME_AUDIO_PATH } from "@/features/voice/sakinah";
import { MAX_RECORDING_SECONDS, MIN_AUDIO_BYTES } from "@/features/voice/audio-validation";
import { SakinahAvatar } from "@/components/companion/sakinah-avatar";

export interface VoiceSendResult {
  assistantMessageId: string | null;
  mode: "crisis" | "safety-check" | "normal";
}

interface Props {
  onSend: (text: string) => Promise<VoiceSendResult | null>;
  onWelcome: () => void;
  onExit: () => void;
  /** The new-chat greeting was already heard, so Start does not replay it. */
  welcomeAlreadyHeard?: boolean;
  /** Stops any other companion audio (the new-chat greeting) so sounds never overlap. */
  onBeforeAudio?: () => void;
}

type VoiceStatusResponse = { available: boolean; consented: boolean };

/** Push-to-talk Voice Mode. Every message goes through the same chat route as typed text. */
export function VoiceMode({ onSend, onWelcome, onExit, welcomeAlreadyHeard = false, onBeforeAudio }: Props) {
  const [state, dispatch] = useReducer(voiceReducer, initialVoiceState);
  const [server, setServer] = useState<VoiceStatusResponse | null>(null);
  const [consentTicked, setConsentTicked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [crisis, setCrisis] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recorderRef = useRef<PushToTalkRecorder | null>(null);
  const uploadRef = useRef<AbortController | null>(null);
  /** messageId → audio for each spoken part (blob URLs), so Replay never pays twice. */
  const audioCache = useRef(new Map<string, Promise<string | null>[]>());
  /** Incremented to cancel whatever is playing or queued. */
  const playToken = useRef(0);
  // Mirrors the reducer synchronously so async handlers always see the latest state.
  const live = useRef(state);
  const act = useCallback((e: VoiceEvent) => {
    live.current = voiceReducer(live.current, e);
    dispatch(e);
  }, []);

  useEffect(() => {
    fetch("/api/voice/consent")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: VoiceStatusResponse | null) => setServer(s ?? { available: false, consented: false }))
      .catch(() => setServer({ available: false, consented: false }));
  }, []);

  const audio = useCallback(() => {
    if (!audioRef.current) {
      const a = new Audio();
      a.preload = "auto";
      audioRef.current = a;
    }
    return audioRef.current;
  }, []);

  const stopAudio = useCallback(() => {
    playToken.current++;
    const a = audioRef.current;
    if (a && !a.paused) a.pause();
  }, []);

  /** Plays one clip to the end on the single audio element; false if it couldn't play or was cancelled. */
  const playOne = useCallback(
    (url: string, token: number) =>
      new Promise<boolean>((resolve) => {
        const a = audio();
        a.pause();
        a.onended = () => resolve(token === playToken.current);
        a.onerror = () => resolve(false);
        a.src = url;
        a.play().catch((err) => {
          setNotice(err instanceof DOMException && err.name === "NotAllowedError" ? "Your browser blocked audio. Tap Replay to hear Sakinah." : "Audio couldn't play. The reply is shown as text; tap Replay to try again.");
          resolve(false);
        });
      }),
    [audio],
  );

  /** Plays clips in order (one element, so they never overlap); any new action cancels the rest. */
  const playClips = useCallback(
    async (clips: Promise<string | null>[]) => {
      const token = ++playToken.current;
      onBeforeAudio?.();
      for (const clip of clips) {
        let url: string | null;
        try {
          url = await clip;
        } catch (e) {
          if (token === playToken.current) act({ type: "ERROR", message: e instanceof Error ? e.message : "Sakinah's voice isn't available just now." });
          return;
        }
        if (token !== playToken.current) return;
        if (!url) continue;
        if (!(await playOne(url, token))) {
          if (token === playToken.current) act({ type: "STOP_SPEAKING" });
          return;
        }
      }
      if (token === playToken.current) act({ type: "PLAYBACK_ENDED" });
    },
    [playOne, act, onBeforeAudio],
  );

  /** Fetches both parts of a reply at once: the short opening plays while the rest is generated. */
  const speechParts = useCallback((messageId: string) => {
    const cached = audioCache.current.get(messageId);
    if (cached) return cached;
    const fetchPart = async (part: number) => {
      const res = await fetch("/api/voice/speech", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId, part }) });
      if (res.status === 204) return null;
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error?.message ?? "Sakinah's voice isn't available just now. The reply is shown as text.");
      return URL.createObjectURL(await res.blob());
    };
    const parts = [fetchPart(0), fetchPart(1).catch(() => null)];
    parts[0].catch(() => audioCache.current.delete(messageId)); // allow a retry after a failure
    audioCache.current.set(messageId, parts);
    return parts;
  }, []);

  const speakReply = useCallback((messageId: string) => playClips(speechParts(messageId)), [playClips, speechParts]);

  const cancelRecording = useCallback(() => {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    uploadRef.current?.abort();
    uploadRef.current = null;
  }, []);

  // Leaving Voice Mode, or the page, always releases the microphone and stops audio.
  useEffect(() => {
    const cache = audioCache.current;
    const onHidden = () => {
      if (document.visibilityState !== "hidden") return;
      if (live.current.status === "LISTENING" || live.current.status === "TRANSCRIBING") {
        cancelRecording();
        act({ type: "CANCEL" });
        setNotice("Recording stopped because the app went into the background.");
      }
      stopAudio();
      act({ type: "STOP_SPEAKING" });
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      cancelRecording();
      audioRef.current?.pause();
      cache.forEach((parts) => parts.forEach((p) => p.then((u) => u && URL.revokeObjectURL(u)).catch(() => {})));
      cache.clear();
    };
  }, [cancelRecording, stopAudio, act]);

  useEffect(() => {
    if (state.status !== "LISTENING") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [state.status, state.attempt]);

  // ── user actions ────────────────────────────────────────────
  async function start() {
    setNotice(null);
    // Play inside the tap so mobile browsers allow audio (and unlock it for later replies).
    const skipWelcome = welcomeAlreadyHeard;
    if (!state.muted && !skipWelcome) void playClips([Promise.resolve(SAKINAH_WELCOME_AUDIO_PATH)]);
    act({ type: "START", skipWelcome });
    onWelcome();
    if (server && !server.consented) {
      const res = await fetch("/api/voice/consent", { method: "POST" }).catch(() => null);
      if (res?.ok) setServer(await res.json());
    }
  }

  async function stopRecording() {
    const rec = recorderRef.current;
    if (!rec || live.current.status !== "LISTENING") return;
    const attempt = live.current.attempt;
    act({ type: "STOP_RECORDING" });
    const recording = await rec.stop();
    recorderRef.current = null;
    if (!recording) return;
    if (recording.seconds < 0.6 || recording.blob.size < MIN_AUDIO_BYTES) {
      act({ type: "ERROR", message: "That was very short. Tap the microphone and speak for a little longer." });
      return;
    }
    const controller = new AbortController();
    uploadRef.current = controller;
    try {
      const form = new FormData();
      const ext = recording.mimeType.includes("mp4") ? "m4a" : recording.mimeType.includes("ogg") ? "ogg" : "webm";
      form.append("audio", recording.blob, `voice.${ext}`);
      const res = await fetch("/api/voice/transcribe", { method: "POST", body: form, signal: controller.signal });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? "I couldn't transcribe that just now. Please try again, or type instead.");
      act({ type: "TRANSCRIBED", attempt, text: String(body.transcript ?? "") });
    } catch (e) {
      if (controller.signal.aborted) return;
      act({ type: "ERROR", message: e instanceof Error ? e.message : "I couldn't transcribe that just now." });
    } finally {
      if (uploadRef.current === controller) uploadRef.current = null;
    }
  }

  async function startRecording() {
    setNotice(null);
    const support = detectVoiceSupport();
    if (!support.ok) {
      act({ type: "ERROR", message: support.reason });
      return;
    }
    stopAudio();
    onBeforeAudio?.();
    cancelRecording();
    setSeconds(0);
    act({ type: "MIC" });
    const rec = new PushToTalkRecorder(support.mimeType, setLevel, () => void stopRecording());
    recorderRef.current = rec;
    try {
      await rec.start();
    } catch (err) {
      rec.cancel();
      recorderRef.current = null;
      act({ type: "ERROR", message: microphoneErrorMessage(err) });
    }
  }

  function cancel() {
    cancelRecording();
    act({ type: "CANCEL" });
  }

  async function send() {
    const text = state.transcript.trim();
    if (!text) return;
    act({ type: "SEND" });
    const result = await onSend(text);
    setCrisis(result?.mode === "crisis");
    const replyId = result?.assistantMessageId ?? null;
    act({ type: "REPLY", replyId, speak: true });
    if (replyId && !live.current.muted) void speakReply(replyId);
  }

  function stopSpeaking() {
    stopAudio();
    act({ type: "STOP_SPEAKING" });
  }

  function replay() {
    const id = state.replyId;
    if (!id) return;
    setNotice(null);
    act({ type: "REPLAY", replyId: id });
    if (id === "welcome") void playClips([Promise.resolve(SAKINAH_WELCOME_AUDIO_PATH)]);
    else void speakReply(id);
  }

  function toggleMute() {
    if (!state.muted) stopAudio();
    act({ type: "TOGGLE_MUTE" });
  }

  function end() {
    cancelRecording();
    stopAudio();
    setCrisis(false);
    act({ type: "END" });
  }

  function exit() {
    end();
    onExit();
  }

  // ── render ──────────────────────────────────────────────────
  const unavailable = server !== null && !server.available;
  const needsConsent = server !== null && server.available && !server.consented;
  const busy = state.status === "TRANSCRIBING" || state.status === "GENERATING_RESPONSE";

  return (
    <section aria-label="Voice conversation with Sakinah" data-testid="voice-mode" className="border-t border-line/70 bg-gradient-to-b from-surface/80 to-brand-50/40 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-4">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-3">
        <div className="flex items-center gap-3">
          <VoiceOrb status={state.status} level={level} />
          <div className="leading-tight">
            <p className="font-display text-xl text-ink">{SAKINAH_NAME}</p>
            <p className="text-xs text-muted">{SAKINAH_SUBTITLE} · AI voice, not a clinician</p>
          </div>
        </div>

        <p role="status" aria-live="polite" data-testid="voice-status" className={cn("text-sm font-medium", state.status === "ERROR" ? "text-safety-700" : "text-brand-800")}>
          {state.started || state.status !== "IDLE" ? STATUS_LABEL[state.status] : "Talk with Sakinah instead of typing"}
          {state.status === "LISTENING" && <span className="ms-1 tabular-nums text-muted">{seconds}s / {MAX_RECORDING_SECONDS}s</span>}
        </p>

        {crisis && (
          <div role="alert" className="w-full rounded-2xl border border-safety-100 bg-safety-50 p-3 text-sm text-safety-700">
            <p className="font-semibold">If you are in danger, call now.</p>
            <p className="mt-1">
              In the UAE: <a className="font-semibold underline" href="tel:998">998</a> (Ambulance) · <a className="font-semibold underline" href="tel:999">999</a> (Police) ·{" "}
              <a className="font-semibold underline" href="tel:800725462">800-SAKINA</a> (the official support line, answered by people; separate from Sakinah). Outside the UAE, call your local emergency number.
            </p>
          </div>
        )}

        {state.error && state.status === "ERROR" && (
          <p data-testid="voice-error" className="w-full rounded-xl bg-safety-50 px-3 py-2 text-center text-sm text-safety-700">
            {state.error}
          </p>
        )}
        {notice && <p className="w-full rounded-xl bg-sand/70 px-3 py-2 text-center text-xs text-ink-soft">{notice}</p>}

        {unavailable ? (
          <div className="flex w-full flex-col items-center gap-2 text-center">
            <p className="text-sm text-ink-soft">Voice isn&apos;t available right now. You can keep chatting by text.</p>
            <Button onClick={exit} data-testid="voice-to-text">
              <Keyboard aria-hidden /> Switch to text chat
            </Button>
          </div>
        ) : !state.started ? (
          <div className="flex w-full flex-col items-center gap-3">
            {needsConsent && (
              <label data-testid="voice-consent" className="flex max-w-md items-start gap-2 rounded-2xl border border-line bg-surface p-3 text-xs text-ink-soft">
                <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={consentTicked} onChange={(e) => setConsentTicked(e.target.checked)} />
                <span>
                  I agree that my voice recordings are sent from SaveTheSoul&apos;s server to OpenAI to be transcribed, and that Sakinah&apos;s replies are turned into speech by OpenAI. SaveTheSoul doesn&apos;t
                  store the recordings. I can turn this off in Profile &amp; Privacy.
                </span>
              </label>
            )}
            <Button size="lg" onClick={start} disabled={server === null || (needsConsent && !consentTicked)} data-testid="voice-start" className="h-14 rounded-full px-7 text-base">
              <Mic aria-hidden /> Start Voice Conversation
            </Button>
            <p className="max-w-md text-center text-[11px] text-muted">The microphone only turns on when you tap it. {SAKINAH_NON_AFFILIATION}</p>
          </div>
        ) : (
          <>
            {state.status === "TRANSCRIPT_READY" ? (
              <div className="flex w-full flex-col gap-2">
                <label htmlFor="voice-transcript" className="text-xs font-medium text-muted">
                  What I heard. You can edit it before sending.
                </label>
                <textarea
                  id="voice-transcript"
                  data-testid="voice-transcript"
                  value={state.transcript}
                  onChange={(e) => act({ type: "EDIT", text: e.target.value })}
                  rows={3}
                  maxLength={4000}
                  className="w-full resize-none rounded-2xl border border-line bg-surface px-4 py-3 text-[15px] text-ink outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
                <div className="flex flex-wrap justify-center gap-2">
                  <Button size="lg" onClick={send} disabled={!state.transcript.trim()} data-testid="voice-send" className="rounded-full">
                    <Send aria-hidden /> Send
                  </Button>
                  <Button variant="secondary" onClick={startRecording} data-testid="voice-rerecord" className="rounded-full">
                    <RotateCcw aria-hidden /> Record again
                  </Button>
                  <Button variant="ghost" onClick={cancel} data-testid="voice-cancel" className="rounded-full">
                    <X aria-hidden /> Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-3">
                {state.status === "LISTENING" ? (
                  <>
                    <BigButton label="Stop recording" onClick={stopRecording} testId="voice-stop-recording" tone="stop">
                      <Square className="size-7" aria-hidden />
                    </BigButton>
                    <Button variant="ghost" onClick={cancel} data-testid="voice-cancel" className="rounded-full">
                      <X aria-hidden /> Cancel
                    </Button>
                  </>
                ) : busy ? (
                  <>
                    <BigButton label={STATUS_LABEL[state.status]} disabled testId="voice-busy">
                      <Loader2 className="size-7 animate-spin" aria-hidden />
                    </BigButton>
                    {state.status === "TRANSCRIBING" && (
                      <Button variant="ghost" onClick={cancel} data-testid="voice-cancel" className="rounded-full">
                        <X aria-hidden /> Cancel
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    {(state.status === "WELCOME_PLAYING" || state.status === "SAKINAH_SPEAKING") && (
                      <Button variant="secondary" onClick={stopSpeaking} data-testid="voice-stop-speaking" className="rounded-full">
                        <Square aria-hidden /> Stop speaking
                      </Button>
                    )}
                    <BigButton label={state.status === "ERROR" ? "Try speaking again" : "Tap to speak"} onClick={startRecording} testId="voice-mic">
                      <Mic className="size-8" aria-hidden />
                    </BigButton>
                    {state.replyId && state.status !== "WELCOME_PLAYING" && state.status !== "SAKINAH_SPEAKING" && (
                      <Button variant="secondary" onClick={replay} data-testid="voice-replay" className="rounded-full">
                        <RotateCcw aria-hidden /> Replay
                      </Button>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}

        <div className="flex w-full flex-wrap items-center justify-center gap-1.5 border-t border-line/60 pt-3 text-sm">
          <Button variant="ghost" size="sm" onClick={toggleMute} aria-pressed={state.muted} data-testid="voice-mute">
            {state.muted ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />} {state.muted ? "Unmute Sakinah" : "Mute Sakinah"}
          </Button>
          <Button variant="ghost" size="sm" onClick={exit} data-testid="voice-to-text">
            <Keyboard aria-hidden /> Switch to text
          </Button>
          {state.started && (
            <Button variant="ghost" size="sm" onClick={end} data-testid="voice-end">
              <PhoneOff aria-hidden /> End voice session
            </Button>
          )}
          <Link href="/help" className="inline-flex h-8 items-center gap-1 rounded-full bg-safety-50 px-3 text-xs font-semibold text-safety-700 ring-1 ring-safety-100">
            <LifeBuoy className="size-3.5" aria-hidden /> Help now
          </Link>
        </div>
      </div>
    </section>
  );
}

function BigButton({ label, onClick, disabled, testId, tone, children }: { label: string; onClick?: () => void; disabled?: boolean; testId: string; tone?: "stop"; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        data-testid={testId}
        className={cn(
          "flex size-20 items-center justify-center rounded-full text-white shadow-lg transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-200 disabled:opacity-70",
          tone === "stop" ? "bg-safety-600 hover:bg-safety-700" : "bg-brand-600 hover:bg-brand-700",
        )}
      >
        {children}
      </button>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}

/** Sakinah's avatar in a glowing ring: pulses with the microphone level, waveform while she speaks. */
function VoiceOrb({ status, level }: { status: VoiceStatus; level: number }) {
  const speaking = status === "WELCOME_PLAYING" || status === "SAKINAH_SPEAKING";
  const listening = status === "LISTENING";
  return (
    <div className="relative flex size-16 items-center justify-center" aria-hidden data-state={status}>
      <span
        className={cn("absolute inset-0 rounded-full bg-brand-300/50 blur-md transition-transform duration-150", (speaking || status === "GENERATING_RESPONSE") && "motion-safe:animate-pulse")}
        style={{ transform: `scale(${1 + (listening ? level * 0.6 : speaking ? 0.25 : 0)})` }}
      />
      <SakinahAvatar className="relative size-14 ring-2 ring-white" />
      {(speaking || listening) && (
        <span className="absolute -bottom-1 flex h-4 items-end gap-[2px] rounded-full bg-brand-700 px-1.5 py-0.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={cn("w-[2px] rounded-full bg-white/90", speaking && "motion-safe:animate-[sts-wave_0.9s_ease-in-out_infinite]")}
              style={{ height: speaking ? 10 : 3 + level * 9 * (1 - Math.abs(i - 2) * 0.25), animationDelay: `${i * 0.12}s` }}
            />
          ))}
        </span>
      )}
    </div>
  );
}

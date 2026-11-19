/**
 * Voice Mode state machine (push-to-talk). Pure, so every transition is unit-tested.
 * The microphone is never opened by a transition alone: LISTENING is only entered from
 * an explicit MIC event that the user triggers.
 */
export type VoiceStatus =
  | "IDLE"
  | "WELCOME_PLAYING"
  | "LISTENING"
  | "TRANSCRIBING"
  | "TRANSCRIPT_READY"
  | "GENERATING_RESPONSE"
  | "SAKINAH_SPEAKING"
  | "ERROR";

export interface VoiceState {
  status: VoiceStatus;
  /** False until the user taps "Start Voice Conversation". */
  started: boolean;
  /** Increments on every recording; stale transcripts from an earlier attempt are ignored. */
  attempt: number;
  transcript: string;
  error: string | null;
  muted: boolean;
  /** The reply that is speaking or can be replayed ("welcome" for the greeting). */
  replyId: string | null;
}

export type VoiceEvent =
  | { type: "START" }
  | { type: "PLAYBACK_ENDED" }
  | { type: "STOP_SPEAKING" }
  | { type: "MIC" }
  | { type: "STOP_RECORDING" }
  | { type: "CANCEL" }
  | { type: "TRANSCRIBED"; attempt: number; text: string }
  | { type: "EDIT"; text: string }
  | { type: "SEND" }
  | { type: "REPLY"; replyId: string | null; speak: boolean }
  | { type: "REPLAY"; replyId: string }
  | { type: "TOGGLE_MUTE" }
  | { type: "ERROR"; message: string }
  | { type: "DISMISS" }
  | { type: "END" };

export const initialVoiceState: VoiceState = {
  status: "IDLE",
  started: false,
  attempt: 0,
  transcript: "",
  error: null,
  muted: false,
  replyId: null,
};

const speaking = (s: VoiceStatus) => s === "WELCOME_PLAYING" || s === "SAKINAH_SPEAKING";

export function voiceReducer(state: VoiceState, event: VoiceEvent): VoiceState {
  switch (event.type) {
    case "START":
      if (state.started && state.status !== "IDLE") return state;
      return { ...state, started: true, status: state.muted ? "IDLE" : "WELCOME_PLAYING", replyId: "welcome", error: null, transcript: "" };
    case "PLAYBACK_ENDED":
    case "STOP_SPEAKING":
      return speaking(state.status) ? { ...state, status: "IDLE" } : state;
    case "MIC":
      // Allowed when ready, while Sakinah speaks (interrupts her), to re-record, or after an error.
      if (!state.started) return state;
      if (["IDLE", "WELCOME_PLAYING", "SAKINAH_SPEAKING", "TRANSCRIPT_READY", "ERROR"].includes(state.status)) {
        return { ...state, status: "LISTENING", attempt: state.attempt + 1, transcript: "", error: null };
      }
      return state;
    case "STOP_RECORDING":
      return state.status === "LISTENING" ? { ...state, status: "TRANSCRIBING" } : state;
    case "CANCEL":
      return ["LISTENING", "TRANSCRIBING", "TRANSCRIPT_READY"].includes(state.status) ? { ...state, status: "IDLE", transcript: "" } : state;
    case "TRANSCRIBED":
      if (state.status !== "TRANSCRIBING" || event.attempt !== state.attempt) return state;
      return { ...state, status: "TRANSCRIPT_READY", transcript: event.text };
    case "EDIT":
      return state.status === "TRANSCRIPT_READY" ? { ...state, transcript: event.text } : state;
    case "SEND":
      return state.status === "TRANSCRIPT_READY" && state.transcript.trim() ? { ...state, status: "GENERATING_RESPONSE" } : state;
    case "REPLY":
      if (state.status !== "GENERATING_RESPONSE") return state;
      return { ...state, transcript: "", replyId: event.replyId, status: event.speak && event.replyId && !state.muted ? "SAKINAH_SPEAKING" : "IDLE" };
    case "REPLAY":
      if (!state.started || !["IDLE", "ERROR", "SAKINAH_SPEAKING", "WELCOME_PLAYING"].includes(state.status)) return state;
      return { ...state, replyId: event.replyId, error: null, status: event.replyId === "welcome" ? "WELCOME_PLAYING" : "SAKINAH_SPEAKING" };
    case "TOGGLE_MUTE": {
      const muted = !state.muted;
      return { ...state, muted, status: muted && speaking(state.status) ? "IDLE" : state.status };
    }
    case "ERROR":
      return { ...state, status: "ERROR", error: event.message };
    case "DISMISS":
      return state.status === "ERROR" ? { ...state, status: "IDLE", error: null } : state;
    case "END":
      return { ...initialVoiceState, muted: state.muted };
  }
}

/** Short, user-facing description of each state (also announced to screen readers). */
export const STATUS_LABEL: Record<VoiceStatus, string> = {
  IDLE: "Ready when you are",
  WELCOME_PLAYING: "Sakinah is speaking…",
  LISTENING: "Listening…",
  TRANSCRIBING: "Transcribing…",
  TRANSCRIPT_READY: "Check your message",
  GENERATING_RESPONSE: "Sakinah is thinking…",
  SAKINAH_SPEAKING: "Sakinah is speaking…",
  ERROR: "Something went wrong",
};

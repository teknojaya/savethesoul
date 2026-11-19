/**
 * Sakinah's greeting when a NEW chat opens.
 * - Shown (as a local, unsaved chat message) whenever the chat is new and empty.
 * - Spoken automatically at most once per browser tab session; later new chats in the same
 *   session show the text with a "Tap to hear Sakinah" button instead of replaying it.
 * The greeting is a static, pre-recorded file: nothing is sent to any AI provider, nothing is
 * stored, and the microphone is never touched.
 */
const STORAGE_KEY = "sts:sakinah-greeting-heard";

export type GreetingAudio = "idle" | "playing" | "blocked" | "ended" | "stopped";

export function shouldShowGreeting(input: { openedExistingConversation: boolean; messageCount: number }): boolean {
  return !input.openedExistingConversation && input.messageCount === 0;
}

export function shouldAutoplayGreeting(input: { showGreeting: boolean; heardThisSession: boolean; muted?: boolean }): boolean {
  return input.showGreeting && !input.heardThisSession && !input.muted;
}

/** sessionStorage can be unavailable (private mode, blocked storage): fail open to "not heard". */
export function greetingHeardThisSession(storage: Pick<Storage, "getItem"> | null = safeSession()): boolean {
  try {
    return storage?.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markGreetingHeard(storage: Pick<Storage, "setItem"> | null = safeSession()): void {
  try {
    storage?.setItem(STORAGE_KEY, "1");
  } catch {
    /* best effort */
  }
}

function safeSession(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Classifies a failed play(): "blocked" means the browser's autoplay policy needs a tap. */
export function classifyPlayError(err: unknown): "blocked" | "failed" {
  return err instanceof DOMException && err.name === "NotAllowedError" ? "blocked" : "failed";
}

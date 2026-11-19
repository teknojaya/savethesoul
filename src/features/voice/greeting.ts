/**
 * Sakinah's greeting for every NEW chat conversation.
 * - A new chat has no database id until the first message is sent, so it gets a draft chat id
 *   (kept in the URL as ?new=…). Refreshing keeps the same id; "New conversation" or arriving
 *   from elsewhere creates a new one. Saved conversations (?c=…) never greet.
 * - The recorded greeting is attempted once per chat id. The attempt is recorded BEFORE play()
 *   so re-renders, navigation and React Strict Mode's double effects can never play it twice.
 * - The greeting is a static, pre-recorded file: nothing is sent to an AI provider, nothing is
 *   saved to the conversation, and the microphone is never touched.
 */
const STORAGE_KEY = "sts:sakinah-greeted-chats";
/** Keeps storage small; the oldest chat ids are forgotten first. */
export const MAX_REMEMBERED_CHATS = 50;

export type GreetingAudio = "idle" | "playing" | "blocked" | "ended" | "stopped";

export function shouldShowGreeting(input: { openedExistingConversation: boolean; messageCount: number }): boolean {
  return !input.openedExistingConversation && input.messageCount === 0;
}

export function shouldAutoplayGreeting(input: { showGreeting: boolean; alreadyAttempted: boolean; muted?: boolean }): boolean {
  return input.showGreeting && !input.alreadyAttempted && !input.muted;
}

/** A fresh id for a new, not-yet-saved chat. */
export function newDraftChatId(random: () => string = defaultRandom): string {
  return `d-${random()}`;
}

export function isDraftChatId(v: string | null | undefined): v is string {
  return !!v && /^d-[A-Za-z0-9-]{8,64}$/.test(v);
}

type Store = Pick<Storage, "getItem" | "setItem">;

function read(storage: Store | null): string[] {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Whether the greeting was already attempted for this chat (storage unavailable → false). */
export function greetingAttempted(chatId: string, storage: Store | null = safeLocal()): boolean {
  return read(storage).includes(chatId);
}

/** Records the attempt for this chat id. Best effort; never throws. */
export function markGreetingAttempted(chatId: string, storage: Store | null = safeLocal()): void {
  try {
    const list = read(storage).filter((x) => x !== chatId);
    list.push(chatId);
    storage?.setItem(STORAGE_KEY, JSON.stringify(list.slice(-MAX_REMEMBERED_CHATS)));
  } catch {
    /* best effort */
  }
}

/** Classifies a failed play(): "blocked" means the browser's autoplay policy needs a tap. */
export function classifyPlayError(err: unknown): "blocked" | "failed" {
  return err instanceof DOMException && err.name === "NotAllowedError" ? "blocked" : "failed";
}

function safeLocal(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function defaultRandom(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

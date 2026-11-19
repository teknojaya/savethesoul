"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUp,
  BookmarkPlus,
  History,
  Home,
  Info,
  LifeBuoy,
  Loader2,
  Plus,
  ShieldAlert,
  Trash2,
  X,
  HeartHandshake,
  Check,
  Mic,
  Keyboard,
  Volume2,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Callout } from "@/components/ui/primitives";
import { CrisisPanel } from "@/components/safety/crisis-panel";
import { RichText } from "./rich-text";
import { VoiceMode, type VoiceSendResult } from "./voice-mode";
import { ComposerMic, type VoiceAvailability } from "./composer-mic";
import { useReplySpeech } from "./use-reply-speech";
import { SAKINAH_NAME, SAKINAH_WELCOME_AUDIO_PATH, SAKINAH_WELCOME_TEXT } from "@/features/voice/sakinah";
import {
  classifyPlayError,
  greetingAttempted,
  isDraftChatId,
  markGreetingAttempted,
  newDraftChatId,
  shouldAutoplayGreeting,
  shouldShowGreeting,
  type GreetingAudio,
} from "@/features/voice/greeting";
import { SakinahAvatar } from "@/components/companion/sakinah-avatar";

/** Sakinah's greeting for a new chat: shown locally, never saved or sent to the AI. */
const GREETING_MESSAGE = { id: "sakinah-greeting", role: "assistant" as const, content: SAKINAH_WELCOME_TEXT, provider: "voice-welcome" };
import { api } from "@/lib/api-client";
import { cn, formatDateTime } from "@/lib/utils";

type Role = "user" | "assistant" | "safety";
interface Msg {
  id: string;
  role: Role;
  content: string;
  provider?: string | null;
  pending?: boolean;
}
interface ConvoSummary {
  id: string;
  title: string;
  updatedAt: string;
  count: number;
}
type SafetyUi =
  | { kind: "none" }
  | { kind: "check"; afterId: string; safetyEventId: string | null }
  | { kind: "crisis"; afterId: string; safetyEventId: string | null }
  | { kind: "safe-but-struggling"; afterId: string };

const SUGGESTIONS = [
  "Work has been really stressful lately",
  "I can't seem to switch off at night",
  "I've been feeling lonely",
  "Can you guide me through a grounding exercise?",
];

function mapRole(r: string): Role {
  return r === "USER" ? "user" : r === "SAFETY" ? "safety" : "assistant";
}

export function CompanionChat(props: {
  preferredName: string;
  provider: { id: string; label: string; isGenerative: boolean };
  memoryEnabled: boolean;
  historyEnabled: boolean;
  demoMode: boolean;
  conversations: ConvoSummary[];
  initial: { id: string; messages: { id: string; role: string; content: string; provider: string | null }[] } | null;
}) {
  const [conversationId, setConversationId] = useState<string | null>(props.initial?.id ?? null);
  const [messages, setMessages] = useState<Msg[]>(() => {
    const existing = props.initial?.messages.map((m) => ({ id: m.id, role: mapRole(m.role), content: m.content, provider: m.provider })) ?? [];
    // A new, empty chat opens with Sakinah's greeting (an existing conversation never does).
    return shouldShowGreeting({ openedExistingConversation: props.initial !== null, messageCount: existing.length }) ? [GREETING_MESSAGE] : existing;
  });
  const [greetingAudio, setGreetingAudio] = useState<GreetingAudio>("idle");
  const greetingRef = useRef<HTMLAudioElement | null>(null);
  /** Identity of the current new (not yet saved) chat, also kept in the URL as ?new=…. */
  const draftChatId = useRef<string | null>(null);
  const pauseOnUnmount = useRef<number | null>(null);
  const [conversations, setConversations] = useState(props.conversations);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [safety, setSafety] = useState<SafetyUi>({ kind: "none" });
  const [showHistory, setShowHistory] = useState(false);
  const [remembering, setRemembering] = useState<{ id: string; text: string } | null>(null);
  const [remembered, setRemembered] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState(false);
  /** Voice availability and consent (for the composer microphone and Listen buttons). */
  const [voice, setVoice] = useState<VoiceAvailability | null>(null);
  /** The message box holds a transcript the user dictated (sent as a spoken message). */
  const [pendingVoice, setPendingVoice] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, safety]);

  /** Plays the pre-recorded greeting. Autoplay may be blocked; then a "Tap to hear Sakinah" button is shown. */
  function playGreeting() {
    if (!greetingRef.current) {
      const a = new Audio(SAKINAH_WELCOME_AUDIO_PATH);
      a.preload = "auto";
      a.onended = () => setGreetingAudio("ended");
      greetingRef.current = a;
    }
    const a = greetingRef.current;
    a.currentTime = 0;
    a.play()
      .then(() => setGreetingAudio("playing"))
      .catch((err) => setGreetingAudio(classifyPlayError(err) === "blocked" ? "blocked" : "stopped"));
  }

  function stopGreeting() {
    const a = greetingRef.current;
    if (a && !a.paused) {
      a.pause();
      setGreetingAudio("stopped");
    }
  }

  const speech = useReplySpeech(() => stopGreeting());

  useEffect(() => {
    fetch("/api/voice/consent")
      .then((r) => (r.ok ? r.json() : null))
      .then((v: VoiceAvailability | null) => setVoice(v ?? { available: false, consented: false }))
      .catch(() => setVoice({ available: false, consented: false }));
  }, []);

  function insertTranscript(text: string) {
    const t = text.trim();
    if (!t) return;
    setInput((prev) => (prev.trim() ? `${prev.trim()} ${t}` : t));
    setPendingVoice(true);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    });
  }

  /** Sends what is in the message box; a dictated message is sent as spoken and its reply read aloud. */
  async function sendComposer() {
    const spoken = pendingVoice;
    setPendingVoice(false);
    const result = await send(input, spoken ? "voice" : "text");
    if (spoken && result?.assistantMessageId && voice?.consented) void speech.speak(result.assistantMessageId);
  }

  /** Attempts the greeting once for this chat id; the attempt is recorded first, so it can never repeat. */
  function greetChat(chatId: string) {
    draftChatId.current = chatId;
    if (!shouldAutoplayGreeting({ showGreeting: true, alreadyAttempted: greetingAttempted(chatId) })) return;
    markGreetingAttempted(chatId);
    playGreeting();
  }

  // A new chat opens: give it an identity (kept on refresh) and greet once. The microphone is never touched.
  useEffect(() => {
    // React Strict Mode remounts immediately in development: cancel the deferred pause instead of cutting the greeting off.
    if (pauseOnUnmount.current !== null) {
      window.clearTimeout(pauseOnUnmount.current);
      pauseOnUnmount.current = null;
    }
    if (messages[0]?.id === GREETING_MESSAGE.id && draftChatId.current === null) {
      const fromUrl = new URLSearchParams(window.location.search).get("new");
      const chatId = isDraftChatId(fromUrl) ? fromUrl : newDraftChatId();
      if (chatId !== fromUrl) window.history.replaceState(null, "", `/patient/companion?new=${chatId}`);
      greetChat(chatId);
    }
    return () => {
      pauseOnUnmount.current = window.setTimeout(() => greetingRef.current?.pause(), 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when the chat opens
  }, []);

  async function ensureConversation(): Promise<string> {
    if (conversationId) return conversationId;
    const { conversation } = await api<{ conversation: { id: string } }>("/api/conversations", { method: "POST" });
    setConversationId(conversation.id);
    window.history.replaceState(null, "", `/patient/companion?c=${conversation.id}`);
    return conversation.id;
  }

  /** Sends one message (typed or transcribed) through the normal, safety-checked chat route. */
  async function send(text: string, inputMode: "text" | "voice" = "text"): Promise<VoiceSendResult | null> {
    const content = text.trim();
    if (!content || busy) return null;
    setBusy(true);
    setInput("");
    setNotice(null);
    stopGreeting();
    const tempUser = `u-${Date.now()}`;
    const tempAsst = `a-${Date.now()}`;
    setMessages((m) => [...m, { id: tempUser, role: "user", content }, { id: tempAsst, role: "assistant", content: "", pending: true }]);

    try {
      const id = await ensureConversation();
      const res = await fetch(`/api/conversations/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, inputMode }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message ?? "The companion is unavailable right now.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let mode: "crisis" | "safety-check" | "normal" = "normal";
      let assistantId: string | null = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "safety") {
            mode = ev.mode;
            if (mode === "crisis") {
              setMessages((m) => m.map((x) => (x.id === tempAsst ? { ...x, role: "safety" } : x)));
            }
          } else if (ev.type === "delta") {
            setMessages((m) => m.map((x) => (x.id === tempAsst ? { ...x, content: x.content + ev.text, pending: false } : x)));
          } else if (ev.type === "replace") {
            setMessages((m) => m.map((x) => (x.id === tempAsst ? { ...x, content: ev.text, pending: false } : x)));
          } else if (ev.type === "done") {
            setMessages((m) => m.map((x) => (x.id === tempAsst ? { ...x, content: ev.text, provider: ev.producedBy, pending: false } : x)));
          } else if (ev.type === "saved") {
            assistantId = ev.assistantMessageId as string;
            setMessages((m) =>
              m.map((x) => (x.id === tempUser ? { ...x, id: ev.userMessageId } : x.id === tempAsst ? { ...x, id: ev.assistantMessageId } : x)),
            );
            if (mode === "crisis") setSafety({ kind: "crisis", afterId: ev.assistantMessageId, safetyEventId: ev.safetyEventId });
            else if (mode === "safety-check") setSafety({ kind: "check", afterId: ev.assistantMessageId, safetyEventId: ev.safetyEventId });
          }
        }
      }
      refreshConversations();
      return { assistantMessageId: assistantId, mode };
    } catch (e) {
      setMessages((m) =>
        m.map((x) =>
          x.id === tempAsst
            ? {
                ...x,
                pending: false,
                provider: "fallback",
                content:
                  "I'm sorry — I couldn't respond just now. If you need to talk to someone, **800-SAKINA (800 725462)** is available 24/7. In an emergency, call **998** or **999**.",
              }
            : x,
        ),
      );
      setNotice(e instanceof Error ? e.message : "Something went wrong.");
      return null;
    } finally {
      setBusy(false);
      if (!voiceMode) inputRef.current?.focus();
    }
  }

  async function refreshConversations() {
    try {
      const { conversations } = await api<{ conversations: { id: string; title: string; updatedAt: string; _count: { messages: number } }[] }>("/api/conversations");
      setConversations(conversations.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, count: c._count.messages })));
    } catch {
      /* non-critical */
    }
  }

  async function reportSafety(level: "IMMEDIATE_DANGER" | "SAFE_BUT_STRUGGLING" | "OK", afterId: string) {
    if (level === "IMMEDIATE_DANGER") {
      try {
        const { safetyEventId } = await api<{ safetyEventId: string }>("/api/safety/events", {
          body: { level: "IMMEDIATE_DANGER", conversationId: conversationId ?? undefined },
        });
        setSafety({ kind: "crisis", afterId, safetyEventId });
      } catch {
        setSafety({ kind: "crisis", afterId, safetyEventId: null });
      }
    } else if (level === "SAFE_BUT_STRUGGLING") {
      setSafety({ kind: "safe-but-struggling", afterId });
    } else {
      setSafety({ kind: "none" });
      setNotice("Thank you for letting me know. I'm here whenever you want to keep talking.");
    }
  }

  async function saveMemory() {
    if (!remembering) return;
    try {
      await api("/api/memories", { body: { content: remembering.text.slice(0, 300) } });
      setRemembered((s) => new Set(s).add(remembering.id));
      setRemembering(null);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not save memory");
    }
  }

  async function deleteConversation(id: string) {
    if (!confirm("Delete this conversation permanently?")) return;
    await api(`/api/conversations/${id}`, { method: "DELETE" });
    setConversations((c) => c.filter((x) => x.id !== id));
    if (id === conversationId) newConversation();
  }

  function newConversation() {
    setConversationId(null);
    stopGreeting();
    setMessages([GREETING_MESSAGE]);
    setGreetingAudio("idle");
    // Every new conversation gets its own identity and one greeting (this runs from a tap, so playing is allowed).
    const chatId = newDraftChatId();
    window.history.replaceState(null, "", `/patient/companion?new=${chatId}`);
    greetChat(chatId);
    setSafety({ kind: "none" });
    setShowHistory(false);
  }

  const isDemoProvider = !props.provider.isGenerative;

  return (
    <div className="flex h-dvh">
      {/* Conversation history */}
      <aside
        className={cn(
          "fixed inset-y-0 start-0 z-40 w-80 max-w-[85vw] flex-col border-e border-line bg-surface transition-transform lg:static lg:z-auto lg:flex lg:w-72 lg:translate-x-0",
          showHistory ? "flex translate-x-0" : "hidden -translate-x-full lg:flex",
        )}
        aria-label="Conversation history"
      >
        <div className="flex items-center justify-between border-b border-line/70 p-4">
          <p className="font-semibold text-ink">Conversations</p>
          <button className="rounded-lg p-1.5 text-muted hover:bg-sand lg:hidden" onClick={() => setShowHistory(false)} aria-label="Close history">
            <X className="size-4" />
          </button>
        </div>
        <div className="p-3">
          <Button variant="soft" className="w-full" onClick={newConversation}>
            <Plus aria-hidden /> New conversation
          </Button>
        </div>
        <ul className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {!props.historyEnabled && (
            <li className="rounded-xl bg-sand/60 p-3 text-xs text-muted">History is off. Conversations are deleted within 24 hours. Change this in Profile & Privacy.</li>
          )}
          {conversations.map((c) => (
            <li key={c.id} className="group flex items-center gap-1">
              <Link
                href={`/patient/companion?c=${c.id}`}
                className={cn(
                  "min-w-0 flex-1 rounded-xl px-3 py-2 text-sm",
                  c.id === conversationId ? "bg-teal-50 text-teal-700" : "text-ink-soft hover:bg-sand/70",
                )}
                onClick={() => setShowHistory(false)}
              >
                <span className="block truncate font-medium">{c.title}</span>
                <span className="block text-xs text-muted">{formatDateTime(c.updatedAt)} · {c.count} messages</span>
              </Link>
              <button
                onClick={() => deleteConversation(c.id)}
                className="rounded-lg p-1.5 text-muted opacity-60 hover:bg-safety-50 hover:text-safety-600 group-hover:opacity-100"
                aria-label={`Delete ${c.title}`}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      </aside>
      {showHistory && <div className="fixed inset-0 z-30 bg-ink/20 lg:hidden" onClick={() => setShowHistory(false)} aria-hidden />}

      {/* Chat */}
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-line/70 bg-surface/70 px-3 py-3 backdrop-blur sm:gap-3 sm:px-4">
          <Link href="/patient" className="rounded-lg p-2 text-ink-soft hover:bg-sand lg:hidden" aria-label="Back to home">
            <Home className="size-5" />
          </Link>
          <button className="rounded-lg p-2 text-ink-soft hover:bg-sand lg:hidden" onClick={() => setShowHistory(true)} aria-label="Show conversation history">
            <History className="size-5" />
          </button>
          <SakinahAvatar className="size-9 ring-2 ring-teal-100" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate font-semibold text-ink">
              {SAKINAH_NAME}
              <span className="hidden sm:inline"> · Wellbeing Companion</span>
            </p>
            <p className="truncate text-xs text-muted" title={isDemoProvider ? undefined : `Replies generated by ${props.provider.label}`}>
              AI<span className="hidden sm:inline"> support</span> · not a clinician{isDemoProvider ? " · offline demo responses" : ""}
            </p>
          </div>
          <Button
            variant={voiceMode ? "soft" : "ghost"}
            size="sm"
            onClick={() => {
              speech.stop();
              setVoiceMode((v) => !v);
            }}
            aria-pressed={voiceMode}
            data-testid="voice-toggle"
            aria-label={voiceMode ? "Switch to text chat" : "Switch to voice mode"}
          >
            {voiceMode ? <Keyboard aria-hidden /> : <Mic aria-hidden />} <span className="hidden sm:inline">{voiceMode ? "Text" : "Voice"}</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={newConversation} className="hidden sm:inline-flex">
            <Plus aria-hidden /> New
          </Button>
          <Link href="/help" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-safety-50 px-3 text-sm font-semibold text-safety-700 ring-1 ring-safety-100">
            <LifeBuoy className="size-4" aria-hidden /> Help
          </Link>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6" aria-live="polite">
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            {isDemoProvider && (
              <Callout tone="amber" icon={<Info />} className="text-xs">
                <strong>Offline demo companion.</strong> No AI model is configured, so replies are pre-written supportive responses chosen by topic — not generated by AI. The safety system runs exactly as it would with a live model.
              </Callout>
            )}

            {messages.length === 0 && (
              <div className="py-6 text-center">
                <p className="font-display text-2xl text-ink">Hi {props.preferredName}, what's on your mind?</p>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted">
                  I'm an AI companion. I can listen and share general wellbeing ideas, but I'm not a doctor and can't diagnose or give medical advice.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-full border border-line bg-surface px-3.5 py-2 text-sm text-ink-soft shadow-soft hover:border-teal-200 hover:bg-teal-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className="flex flex-col gap-3">
                <MessageBubble
                  m={m}
                  canRemember={props.memoryEnabled && m.role === "user" && !m.id.startsWith("u-")}
                  remembered={remembered.has(m.id)}
                  onRemember={() => setRemembering({ id: m.id, text: m.content })}
                  listen={
                    voice?.available && voice.consented && !voiceMode && m.role !== "user" && !m.pending && !/^(a-|w-|sakinah-greeting)/.test(m.id)
                      ? { speaking: speech.speakingId === m.id, onListen: () => speech.speak(m.id), onStop: speech.stop }
                      : null
                  }
                />
                {m.id === GREETING_MESSAGE.id && (
                  <GreetingControls
                    state={greetingAudio}
                    onPlay={playGreeting}
                    onStop={stopGreeting}
                    showSuggestions={!messages.some((x) => x.role === "user")}
                    onSuggestion={(t) => send(t)}
                    preferredName={props.preferredName}
                  />
                )}
                {remembering?.id === m.id && (
                  <div className="ms-auto flex w-full max-w-md flex-col gap-2 rounded-2xl border border-teal-100 bg-teal-50 p-3 text-sm">
                    <label htmlFor="mem" className="font-medium text-teal-900">Save to your wellbeing memory</label>
                    <textarea
                      id="mem"
                      className="rounded-xl border border-line bg-surface p-2 text-sm"
                      rows={2}
                      maxLength={300}
                      value={remembering.text}
                      onChange={(e) => setRemembering({ ...remembering, text: e.target.value })}
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setRemembering(null)}>Cancel</Button>
                      <Button size="sm" onClick={saveMemory}>Save</Button>
                    </div>
                  </div>
                )}
                {safety.kind !== "none" && safety.afterId === m.id && (
                  <>
                    {safety.kind === "crisis" && <CrisisPanel safetyEventId={safety.safetyEventId} demoMode={props.demoMode} />}
                    {safety.kind === "check" && <SafetyCheckCard onAnswer={(l) => reportSafety(l, m.id)} />}
                    {safety.kind === "safe-but-struggling" && <StrugglingCard />}
                  </>
                )}
              </div>
            ))}
            {notice && <p className="text-center text-xs text-muted">{notice}</p>}
          </div>
        </div>

        {voiceMode ? (
          <VoiceMode
            onSend={(t) => send(t, "voice")}
            onWelcome={() =>
              setMessages((m) => (m.some((x) => x.provider === "voice-welcome") ? m : [...m, { id: `w-${Date.now()}`, role: "assistant", content: SAKINAH_WELCOME_TEXT, provider: "voice-welcome" }]))
            }
            onExit={() => setVoiceMode(false)}
            welcomeAlreadyHeard={
              greetingAudio === "playing" ||
              greetingAudio === "ended" ||
              greetingAudio === "stopped" ||
              (greetingAudio === "idle" && draftChatId.current !== null && greetingAttempted(draftChatId.current))
            }
            onBeforeAudio={stopGreeting}
          />
        ) : (
        <footer className="border-t border-line/70 bg-surface/80 px-4 pb-safe pt-3 backdrop-blur">
          <form
            className="relative mx-auto flex max-w-2xl items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void sendComposer();
            }}
          >
            <label htmlFor="composer" className="sr-only">Message the companion</label>
            <textarea
              id="composer"
              ref={inputRef}
              rows={1}
              value={input}
              maxLength={4000}
              onChange={(e) => {
                setInput(e.target.value);
                if (!e.target.value.trim()) setPendingVoice(false);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void sendComposer();
                }
              }}
              placeholder="Write how you're feeling…"
              className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl border border-line bg-surface px-4 py-2.5 text-[15px] focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
            />
            <ComposerMic
              disabled={busy}
              voice={voice}
              onVoiceChange={setVoice}
              onTranscript={insertTranscript}
              onBeforeRecord={() => {
                stopGreeting();
                speech.stop();
              }}
            />
            <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send message" className="size-11 shrink-0">
              {busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}
            </Button>
          </form>
          {pendingVoice && input.trim() && (
            <p className="mx-auto mt-1.5 max-w-2xl text-center text-xs text-teal-800" data-testid="transcript-review-hint">
              Check what I heard and edit it if needed, then tap Send.
            </p>
          )}
          {speech.error && <p className="mx-auto mt-1.5 max-w-2xl text-center text-xs text-safety-700">{speech.error}</p>}
          <p className="mx-auto mt-2 max-w-2xl pb-1 text-center text-[11px] text-muted">
            AI wellbeing companion — general support, not medical advice. In an emergency in the UAE call <a href="tel:999" className="font-semibold text-safety-700">999</a> or{" "}
            <a href="tel:998" className="font-semibold text-safety-700">998</a>; elsewhere, your local emergency number.
          </p>
        </footer>
        )}
      </section>
    </div>
  );
}

function MessageBubble({
  m,
  canRemember,
  remembered,
  onRemember,
  listen,
}: {
  m: Msg;
  canRemember: boolean;
  remembered: boolean;
  onRemember: () => void;
  listen?: { speaking: boolean; onListen: () => void; onStop: () => void } | null;
}) {
  if (m.role === "user") {
    return (
      <div className="group ms-auto flex max-w-[85%] flex-col items-end gap-1">
        <div className="whitespace-pre-wrap rounded-2xl rounded-ee-md bg-teal-600 px-4 py-2.5 text-[15px] text-white shadow-soft">{m.content}</div>
        {canRemember &&
          (remembered ? (
            <span className="flex items-center gap-1 text-xs text-teal-700"><Check className="size-3" aria-hidden /> Saved to memory</span>
          ) : (
            <button onClick={onRemember} className="flex items-center gap-1 text-xs text-muted opacity-70 hover:text-teal-700 group-hover:opacity-100">
              <BookmarkPlus className="size-3" aria-hidden /> Remember this
            </button>
          ))}
      </div>
    );
  }
  const isSafety = m.role === "safety";
  return (
    <div className="flex max-w-[92%] gap-2.5">
      {isSafety ? (
        <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-safety-500 text-white">
          <ShieldAlert className="size-4" aria-hidden />
        </span>
      ) : (
        <SakinahAvatar className="mt-1 size-7" />
      )}
      <div className="min-w-0">
        <div
          className={cn(
            "rounded-2xl rounded-es-md px-4 py-2.5 text-[15px] leading-relaxed shadow-soft",
            isSafety ? "border border-safety-100 bg-safety-50 text-ink" : "bg-surface text-ink",
          )}
        >
          {m.pending ? (
            <span className="flex items-center gap-1 py-1" aria-label="Companion is typing">
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-1.5 animate-bounce rounded-full bg-muted/60" style={{ animationDelay: `${i * 120}ms` }} />
              ))}
            </span>
          ) : (
            <RichText text={m.content} />
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 ps-1">
          {isSafety && <Badge tone="safety">Safety response · pre-written, not AI-generated</Badge>}
          {m.provider === "fallback" && <Badge tone="neutral">Safe fallback response</Badge>}
          {m.provider === "demo" && <Badge tone="amber">Pre-written demo response</Badge>}
          {m.provider === "voice-welcome" && <Badge tone="neutral">Sakinah · pre-recorded AI voice greeting</Badge>}
          {(m.provider === "openai" || m.provider === "anthropic") && <Badge tone="neutral">AI-generated · not medical advice</Badge>}
          {listen && (
            <button
              type="button"
              onClick={listen.speaking ? listen.onStop : listen.onListen}
              className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-medium text-teal-700 hover:bg-teal-50"
              aria-label={listen.speaking ? "Stop reading aloud" : "Listen to this reply"}
              data-testid="reply-listen"
            >
              {listen.speaking ? <Square className="size-3.5" aria-hidden /> : <Volume2 className="size-3.5" aria-hidden />} {listen.speaking ? "Stop" : "Listen"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SafetyCheckCard({ onAnswer }: { onAnswer: (l: "IMMEDIATE_DANGER" | "SAFE_BUT_STRUGGLING" | "OK") => void }) {
  return (
    <div className="animate-fade-up rounded-3xl border border-sky-100 bg-sky-50 p-4 sm:p-5" data-testid="safety-check">
      <p className="flex items-center gap-2 font-semibold text-sky-700"><HeartHandshake className="size-4" aria-hidden /> Checking in on you</p>
      <p className="mt-1 text-sm text-ink-soft">Are you thinking about ending your life, or are you in danger right now? Whatever your answer, it's okay to say it.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button variant="safety" size="sm" onClick={() => onAnswer("IMMEDIATE_DANGER")}>I'm in danger right now</Button>
        <Button variant="secondary" size="sm" onClick={() => onAnswer("SAFE_BUT_STRUGGLING")}>I'm having thoughts, but I'm safe right now</Button>
        <Button variant="ghost" size="sm" onClick={() => onAnswer("OK")}>No, I'm not</Button>
      </div>
    </div>
  );
}

function StrugglingCard() {
  return (
    <div className="animate-fade-up rounded-3xl border border-teal-100 bg-surface p-4 shadow-soft sm:p-5">
      <p className="font-semibold text-ink">Thank you for being honest. You deserve support with this.</p>
      <ul className="mt-2 space-y-1.5 text-sm text-ink-soft">
        <li>• Talk to someone trained, any time: <a href="tel:800725462" className="font-semibold text-teal-700">800-SAKINA (800 725462)</a> — free, confidential, 24/7.</li>
        <li>• Look at your <Link href="/patient/circle#safety-plan" className="font-medium text-teal-700 underline-offset-2 hover:underline">safety plan</Link>, or make one now.</li>
        <li>• Consider <Link href="/patient/support" className="font-medium text-teal-700 underline-offset-2 hover:underline">connecting with a professional</Link>.</li>
        <li>• If things change and you feel in danger, call <a href="tel:998" className="font-semibold text-safety-700">998</a> or <a href="tel:999" className="font-semibold text-safety-700">999</a>.</li>
      </ul>
    </div>
  );
}

/** Under Sakinah's greeting: autoplay status, a deliberate "Tap to hear Sakinah" fallback, and starter prompts. */
function GreetingControls({
  state,
  onPlay,
  onStop,
  showSuggestions,
  onSuggestion,
  preferredName,
}: {
  state: GreetingAudio;
  onPlay: () => void;
  onStop: () => void;
  showSuggestions: boolean;
  onSuggestion: (text: string) => void;
  preferredName: string;
}) {
  return (
    <div className="ms-9 flex flex-col gap-3" data-testid="greeting-audio" data-state={state}>
      <div className="flex flex-wrap items-center gap-2" aria-live="polite">
        {state === "playing" ? (
          <>
            <span className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-800">
              <span className="flex h-3 items-end gap-[2px]" aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className="h-3 w-[2px] rounded-full bg-teal-600 motion-safe:animate-[sts-wave_0.9s_ease-in-out_infinite]" style={{ animationDelay: `${i * 0.12}s` }} />
                ))}
              </span>
              Sakinah is speaking…
            </span>
            <Button variant="ghost" size="sm" onClick={onStop} data-testid="greeting-stop">
              <Square aria-hidden /> Stop
            </Button>
          </>
        ) : state === "blocked" ? (
          <Button variant="soft" size="sm" onClick={onPlay} data-testid="greeting-play" className="rounded-full">
            <Volume2 aria-hidden /> Tap to hear Sakinah
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={onPlay} data-testid="greeting-play" className="rounded-full text-muted">
            <Volume2 aria-hidden /> {state === "idle" ? "Hear Sakinah's greeting" : "Hear it again"}
          </Button>
        )}
      </div>
      <p className="flex items-start gap-2 rounded-2xl bg-teal-50/70 px-3 py-2 text-sm text-teal-900" data-testid="voice-hint">
        <Mic className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>Prefer talking instead of typing? Just tap the microphone beside the message box. I&apos;m here to listen.</span>
      </p>
      {showSuggestions && (
        <div>
          <p className="mb-2 text-xs text-muted">Or start with one of these, {preferredName}:</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((t) => (
              <button
                key={t}
                onClick={() => onSuggestion(t)}
                className="rounded-full border border-line bg-surface px-3.5 py-2 text-sm text-ink-soft shadow-soft hover:border-teal-200 hover:bg-teal-50"
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import http from "node:http";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import OpenAI from "openai";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { SAKINAH_NAME, SAKINAH_SUBTITLE, SAKINAH_WELCOME_AUDIO_PATH, SAKINAH_WELCOME_TEXT } from "@/features/voice/sakinah";
import { initialVoiceState, voiceReducer, type VoiceEvent, type VoiceState } from "@/features/voice/voice-state";
import { checkAudio, MAX_AUDIO_BYTES, sniffContainer } from "@/features/voice/audio-validation";
import { MAX_SPEECH_CHARS, splitForSpeech, toSpeakableText } from "@/features/voice/speech-text";
import { buildCompanionSystem, VOICE_REPLY_ADDENDUM } from "@/features/ai/prompts";
import { microphoneErrorMessage, pickRecorderMimeType } from "@/features/voice/recorder";
import { OpenAIVoiceProvider, VoiceError } from "@/features/voice/voice-provider";
import { classifyPlayError, greetingAttempted, isDraftChatId, markGreetingAttempted, MAX_REMEMBERED_CHATS, newDraftChatId, shouldAutoplayGreeting, shouldShowGreeting } from "@/features/voice/greeting";

const run = (events: VoiceEvent[], from: VoiceState = initialVoiceState) => events.reduce(voiceReducer, from);

describe("Sakinah identity and welcome", () => {
  it("uses the exact approved welcome text", () => {
    expect(SAKINAH_WELCOME_TEXT).toBe(
      "Hello, I'm Sakinah, your AI wellbeing companion. I'm here to listen, support you, and help you through whatever is on your mind or whatever you're going through. You can share anything you're comfortable with, at your own pace. How are you feeling today?",
    );
    expect(SAKINAH_NAME).toBe("Sakinah");
    expect(SAKINAH_SUBTITLE).toBe("Your AI Wellbeing Companion");
  });

  it("ships the welcome as a pre-generated static MP3 (no paid call per page load)", () => {
    const bytes = new Uint8Array(readFileSync(`public${SAKINAH_WELCOME_AUDIO_PATH}`));
    expect(sniffContainer(bytes)).toBe("mp3");
    expect(bytes.length).toBeGreaterThan(50_000);
  });
});

describe("New-chat greeting", () => {
  it("is shown only for a new, empty chat, never when an existing conversation is opened", () => {
    expect(shouldShowGreeting({ openedExistingConversation: false, messageCount: 0 })).toBe(true);
    expect(shouldShowGreeting({ openedExistingConversation: true, messageCount: 0 })).toBe(false);
    expect(shouldShowGreeting({ openedExistingConversation: true, messageCount: 4 })).toBe(false);
  });

  it("is attempted once per new chat conversation, tracked by the chat's identity", () => {
    expect(shouldAutoplayGreeting({ showGreeting: true, alreadyAttempted: false })).toBe(true);
    expect(shouldAutoplayGreeting({ showGreeting: true, alreadyAttempted: true })).toBe(false);
    expect(shouldAutoplayGreeting({ showGreeting: false, alreadyAttempted: false })).toBe(false);
    expect(shouldAutoplayGreeting({ showGreeting: true, alreadyAttempted: false, muted: true })).toBe(false);

    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const chatA = newDraftChatId(() => "aaaaaaaa-1111");
    const chatB = newDraftChatId(() => "bbbbbbbb-2222");
    expect(isDraftChatId(chatA)).toBe(true);
    expect(isDraftChatId("cmwndqmzu000612nwiii8uz6k")).toBe(false); // a saved conversation id is not a draft
    expect(isDraftChatId("d-<script>")).toBe(false);
    expect(greetingAttempted(chatA, storage)).toBe(false);
    markGreetingAttempted(chatA, storage);
    expect(greetingAttempted(chatA, storage)).toBe(true); // refresh / revisit: no replay
    expect(greetingAttempted(chatB, storage)).toBe(false); // a new conversation greets again
    markGreetingAttempted(chatA, storage);
    expect(JSON.parse(store.values().next().value!)).toEqual([chatA]); // no duplicates
  });

  it("keeps the record small and never crashes when storage is unavailable", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    for (let i = 0; i < MAX_REMEMBERED_CHATS + 5; i++) markGreetingAttempted(`d-chat-${String(i).padStart(4, "0")}`, storage);
    expect(greetingAttempted("d-chat-0000", storage)).toBe(false); // oldest forgotten
    expect(greetingAttempted(`d-chat-${String(MAX_REMEMBERED_CHATS + 4).padStart(4, "0")}`, storage)).toBe(true);
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(greetingAttempted("d-x-12345678", broken)).toBe(false);
    expect(() => markGreetingAttempted("d-x-12345678", broken)).not.toThrow();
    expect(greetingAttempted("d-x-12345678", null)).toBe(false);
  });

  it("recognises a browser autoplay block, so the 'Tap to hear Sakinah' fallback is shown", () => {
    expect(classifyPlayError(new DOMException("x", "NotAllowedError"))).toBe("blocked");
    expect(classifyPlayError(new DOMException("x", "NotSupportedError"))).toBe("failed");
  });

  it("Voice Mode does not replay a greeting the user already heard", () => {
    expect(voiceReducer(initialVoiceState, { type: "START", skipWelcome: true })).toMatchObject({ status: "IDLE", started: true });
    expect(voiceReducer(initialVoiceState, { type: "START", skipWelcome: false }).status).toBe("WELCOME_PLAYING");
  });
});

describe("Voice state machine", () => {
  it("starts idle with the microphone off, and plays the welcome only after Start", () => {
    expect(initialVoiceState).toMatchObject({ status: "IDLE", started: false });
    expect(run([{ type: "MIC" }]).status).toBe("IDLE"); // no mic before Start
    expect(run([{ type: "START" }])).toMatchObject({ status: "WELCOME_PLAYING", started: true, replyId: "welcome" });
  });

  it("lets the user stop or interrupt the welcome, and never opens the mic by itself", () => {
    expect(run([{ type: "START" }, { type: "STOP_SPEAKING" }]).status).toBe("IDLE");
    expect(run([{ type: "START" }, { type: "PLAYBACK_ENDED" }]).status).toBe("IDLE");
    expect(run([{ type: "START" }, { type: "MIC" }]).status).toBe("LISTENING");
  });

  it("records, transcribes, lets the user edit, and sends", () => {
    const s = run([{ type: "START" }, { type: "PLAYBACK_ENDED" }, { type: "MIC" }, { type: "STOP_RECORDING" }]);
    expect(s.status).toBe("TRANSCRIBING");
    const ready = run([{ type: "TRANSCRIBED", attempt: s.attempt, text: "I feel stresed" }, { type: "EDIT", text: "I feel stressed" }], s);
    expect(ready).toMatchObject({ status: "TRANSCRIPT_READY", transcript: "I feel stressed" });
    expect(voiceReducer(ready, { type: "SEND" }).status).toBe("GENERATING_RESPONSE");
    expect(voiceReducer({ ...ready, transcript: "  " }, { type: "SEND" }).status).toBe("TRANSCRIPT_READY");
  });

  it("ignores a late transcript from a cancelled or earlier recording", () => {
    const first = run([{ type: "START" }, { type: "MIC" }, { type: "STOP_RECORDING" }]);
    const cancelled = voiceReducer(first, { type: "CANCEL" });
    expect(cancelled.status).toBe("IDLE");
    expect(voiceReducer(cancelled, { type: "TRANSCRIBED", attempt: first.attempt, text: "old" }).status).toBe("IDLE");
    const second = run([{ type: "MIC" }, { type: "STOP_RECORDING" }], cancelled);
    expect(voiceReducer(second, { type: "TRANSCRIBED", attempt: first.attempt, text: "old" }).status).toBe("TRANSCRIBING");
    expect(voiceReducer(second, { type: "TRANSCRIBED", attempt: second.attempt, text: "new" }).transcript).toBe("new");
  });

  it("cancels from listening, transcribing or review", () => {
    const listening = run([{ type: "START" }, { type: "MIC" }]);
    expect(voiceReducer(listening, { type: "CANCEL" })).toMatchObject({ status: "IDLE", transcript: "" });
    const ready = run([{ type: "STOP_RECORDING" }, { type: "TRANSCRIBED", attempt: listening.attempt, text: "hi" }], listening);
    expect(voiceReducer(ready, { type: "CANCEL" }).status).toBe("IDLE");
    expect(voiceReducer(ready, { type: "MIC" }).status).toBe("LISTENING"); // record again
  });

  it("speaks the reply unless muted, then returns to mic-ready (not listening)", () => {
    const generating: VoiceState = { ...initialVoiceState, started: true, status: "GENERATING_RESPONSE", transcript: "hi" };
    const speaking = voiceReducer(generating, { type: "REPLY", replyId: "m1", speak: true });
    expect(speaking).toMatchObject({ status: "SAKINAH_SPEAKING", replyId: "m1", transcript: "" });
    expect(voiceReducer(speaking, { type: "PLAYBACK_ENDED" }).status).toBe("IDLE");
    expect(voiceReducer({ ...generating, muted: true }, { type: "REPLY", replyId: "m1", speak: true }).status).toBe("IDLE");
    expect(voiceReducer(generating, { type: "REPLY", replyId: null, speak: true }).status).toBe("IDLE");
  });

  it("supports replay, mute while speaking, errors and ending the session", () => {
    const idle: VoiceState = { ...initialVoiceState, started: true, replyId: "m1" };
    expect(voiceReducer(idle, { type: "REPLAY", replyId: "m1" }).status).toBe("SAKINAH_SPEAKING");
    expect(voiceReducer(idle, { type: "REPLAY", replyId: "welcome" }).status).toBe("WELCOME_PLAYING");
    const muted = voiceReducer({ ...idle, status: "SAKINAH_SPEAKING" }, { type: "TOGGLE_MUTE" });
    expect(muted).toMatchObject({ muted: true, status: "IDLE" });
    expect(run([{ type: "START" }], { ...initialVoiceState, muted: true }).status).toBe("IDLE"); // muted: no welcome audio
    const err = voiceReducer(idle, { type: "ERROR", message: "Mic blocked" });
    expect(err).toMatchObject({ status: "ERROR", error: "Mic blocked" });
    expect(voiceReducer(err, { type: "DISMISS" }).status).toBe("IDLE");
    expect(voiceReducer(err, { type: "MIC" }).status).toBe("LISTENING");
    expect(voiceReducer({ ...idle, muted: true }, { type: "END" })).toEqual({ ...initialVoiceState, muted: true });
  });
});

describe("Audio upload validation", () => {
  const pad = (head: number[], n = 2048) => {
    const b = new Uint8Array(n);
    b.set(head);
    return b;
  };
  const webm = pad([0x1a, 0x45, 0xdf, 0xa3]);
  const mp4 = pad([0, 0, 0, 0x20, ...Buffer.from("ftypM4A ")]);
  const ogg = pad([...Buffer.from("OggS")]);
  const wav = pad([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WAVE")]);
  const mp3 = pad([...Buffer.from("ID3")]);

  it.each([
    ["audio/webm;codecs=opus", webm, "webm"],
    ["audio/mp4", mp4, "m4a"],
    ["audio/ogg;codecs=opus", ogg, "ogg"],
    ["audio/wav", wav, "wav"],
    ["audio/mpeg", mp3, "mp3"],
  ])("accepts %s with a matching signature", (type, bytes, ext) => {
    expect(checkAudio(type, bytes)).toMatchObject({ ok: true, extension: ext });
  });

  it("rejects a declared type that does not match the file's signature", () => {
    expect(checkAudio("audio/webm", mp4)).toEqual({ ok: false, reason: "UNSUPPORTED" });
    expect(checkAudio("application/pdf", pad([...Buffer.from("%PDF")]))).toEqual({ ok: false, reason: "UNSUPPORTED" });
    expect(checkAudio("audio/webm", pad([1, 2, 3, 4]))).toEqual({ ok: false, reason: "UNSUPPORTED" });
  });

  it("enforces size limits", () => {
    expect(checkAudio("audio/webm", webm.subarray(0, 100))).toEqual({ ok: false, reason: "TOO_SHORT" });
    expect(checkAudio("audio/webm", pad([0x1a, 0x45, 0xdf, 0xa3], MAX_AUDIO_BYTES + 1))).toEqual({ ok: false, reason: "TOO_LARGE" });
  });
});

describe("Speech text", () => {
  it("removes Markdown so symbols are not read aloud", () => {
    expect(toSpeakableText("**Please call 998 now.**\n\n- Breathe in for *4*\n- Out for 6\n\n[Help](/help)")).toBe("Please call 998 now.\nBreathe in for 4\nOut for 6\nHelp");
  });
  it("splits long replies into a short opening and the rest, without losing text", () => {
    expect(splitForSpeech("Short reply. Just this.")).toEqual(["Short reply. Just this."]);
    const long = "That sounds really draining, Sam. When work follows you home it is hard to rest. You could try writing tomorrow's tasks down. Then put the list away and do something calm. A short walk can help too. Would you like a simple routine?";
    const [first, rest] = splitForSpeech(long);
    expect(first.length).toBeGreaterThanOrEqual(60);
    expect(first.length).toBeLessThanOrEqual(220);
    expect(first).toMatch(/[.!?]$/);
    expect(`${first} ${rest}`.replace(/\s+/g, " ")).toBe(long);
    expect(splitForSpeech("")).toEqual([]);
  });

  it("asks for short, list-free replies only for spoken messages", () => {
    expect(buildCompanionSystem({ memories: [], safetyMode: false, spoken: true })).toContain(VOICE_REPLY_ADDENDUM);
    expect(buildCompanionSystem({ memories: [], safetyMode: false })).not.toContain(VOICE_REPLY_ADDENDUM);
    expect(buildCompanionSystem({ memories: [], safetyMode: false })).toMatch(/You are Sakinah.*independent AI companion.*not affiliated with the official 800-SAKINA/);
  });

  it("caps very long replies at a sentence boundary", () => {
    const t = toSpeakableText("This is a sentence. ".repeat(400));
    expect(t.length).toBeLessThanOrEqual(MAX_SPEECH_CHARS);
    expect(t.endsWith(".")).toBe(true);
  });
});

describe("Browser recording support", () => {
  it("prefers WebM/Opus (Chrome, Android) and falls back to MP4 (Safari, iOS)", () => {
    expect(pickRecorderMimeType((t) => t.startsWith("audio/webm"))).toBe("audio/webm;codecs=opus");
    expect(pickRecorderMimeType((t) => t === "audio/mp4")).toBe("audio/mp4");
    expect(pickRecorderMimeType(() => false)).toBeNull();
    expect(pickRecorderMimeType(() => {
      throw new Error("unsupported");
    })).toBeNull();
  });
  it("explains microphone failures in plain language", () => {
    expect(microphoneErrorMessage(new DOMException("x", "NotAllowedError"))).toMatch(/blocked/);
    expect(microphoneErrorMessage(new DOMException("x", "NotFoundError"))).toMatch(/No microphone/);
    expect(microphoneErrorMessage(new Error("?"))).toMatch(/couldn't start/);
  });
});

describe("Voice kill switch", () => {
  it("VOICE_ENABLED=false makes Voice Mode unavailable even with a key", async () => {
    const { getVoiceProvider, setVoiceProviderOverride } = await import("@/features/voice/voice-provider");
    const { resetEnvCache } = await import("@/lib/env");
    const saved = { ...process.env };
    setVoiceProviderOverride(undefined);
    try {
      Object.assign(process.env, { OPENAI_API_KEY: "sk-test", LLM_PROVIDER: "openai", VOICE_ENABLED: "true" });
      resetEnvCache();
      expect(getVoiceProvider()?.id).toBe("openai");
      process.env.VOICE_ENABLED = "false";
      resetEnvCache();
      expect(getVoiceProvider()).toBeNull();
    } finally {
      process.env = saved;
      resetEnvCache();
    }
  });
});

describe("OpenAIVoiceProvider (real SDK against a local fake API)", () => {
  type Reply = { status?: number; json?: object; body?: Buffer; delayMs?: number };
  let next: Reply = {};
  const seen: { path: string; contentType: string; raw: Buffer }[] = [];
  let server: http.Server;
  let baseURL = "";

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", async () => {
        seen.push({ path: req.url ?? "", contentType: req.headers["content-type"] ?? "", raw: Buffer.concat(chunks) });
        const r = next;
        if (r.delayMs) await new Promise((ok) => setTimeout(ok, r.delayMs));
        if (r.body) {
          res.writeHead(200, { "content-type": "audio/mpeg" });
          res.end(r.body);
          return;
        }
        res.writeHead(r.status ?? 200, { "content-type": "application/json" });
        res.end(JSON.stringify(r.json ?? {}));
      });
    });
    await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
    baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  });
  afterAll(() => new Promise<void>((ok) => server.close(() => ok())));
  afterEach(() => {
    seen.length = 0;
    next = {};
  });

  const provider = (timeout = 5000) =>
    new OpenAIVoiceProvider("sk-test", "gpt-4o-mini-transcribe", "gpt-4o-mini-tts", "marin", "en", timeout, new OpenAI({ apiKey: "sk-test", baseURL, timeout, maxRetries: 0 }));
  const audio = { bytes: new Uint8Array(2048).fill(7), filename: "recording.webm", mime: "audio/webm" };

  it("transcribes with the configured model and language (multipart upload)", async () => {
    next = { json: { text: "  I've had a stressful week.  " } };
    expect(await provider().transcribe(audio)).toBe("I've had a stressful week.");
    const req = seen[0];
    expect(req.path).toBe("/v1/audio/transcriptions");
    expect(req.contentType).toMatch(/multipart\/form-data/);
    const body = req.raw.toString("latin1");
    expect(body).toContain("gpt-4o-mini-transcribe");
    expect(body).toMatch(/name="language"\r\n\r\nen/);
    expect(body).toContain('filename="recording.webm"');
  });

  it("treats an empty transcript as EMPTY", async () => {
    next = { json: { text: "   " } };
    await expect(provider().transcribe(audio)).rejects.toMatchObject({ code: "EMPTY" });
  });

  it("synthesises MP3 speech with Sakinah's voice and calm delivery instructions", async () => {
    next = { body: Buffer.from("ID3fake-mp3") };
    const out = await provider().speak("Hello Sam.");
    expect(Buffer.from(out).toString()).toBe("ID3fake-mp3");
    const sent = JSON.parse(seen[0].raw.toString());
    expect(seen[0].path).toBe("/v1/audio/speech");
    expect(sent).toMatchObject({ model: "gpt-4o-mini-tts", voice: "marin", input: "Hello Sam.", response_format: "mp3" });
    expect(sent.instructions).toMatch(/calm, warm and gentle/);
  });

  it.each([
    [401, "CONFIG"],
    [400, "CONFIG"],
    [429, "RATE_LIMITED"],
    [500, "UNAVAILABLE"],
  ])("maps HTTP %i to %s", async (status, code) => {
    next = { status, json: { error: { message: "x" } } };
    const err = await provider().speak("Hi").catch((e) => e);
    expect(err).toBeInstanceOf(VoiceError);
    expect(err.code).toBe(code);
  });

  it("maps a slow provider to TIMEOUT", async () => {
    next = { delayMs: 400, json: { text: "late" } };
    await expect(provider(100).transcribe(audio)).rejects.toMatchObject({ code: "TIMEOUT" });
  });
});

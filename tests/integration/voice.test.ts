import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Actor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { encrypt } from "@/lib/crypto";
import { resetRateLimits } from "@/lib/rate-limit";
import { setProviderOverride } from "@/features/ai/provider-factory";
import type { ChatProvider, GenerateInput } from "@/features/ai/types";
import { setVoiceProviderOverride, VoiceError, type VoiceProvider } from "@/features/voice/voice-provider";
import { makeClinician, makePatient, resetDb } from "../support/fixtures";

/**
 * Voice Mode server behaviour with fake providers (no network). Synthetic content only.
 * Voice is an input/output layer: every spoken message still goes through the normal chat route.
 */
const current: { actor: Actor | null } = { actor: null };
vi.mock("@/lib/auth/current-user", () => ({ getCurrentActor: async () => current.actor }));

const consent = await import("@/app/api/voice/consent/route");
const transcribe = await import("@/app/api/voice/transcribe/route");
const speech = await import("@/app/api/voice/speech/route");
const conversations = await import("@/app/api/conversations/route");
const messages = await import("@/app/api/conversations/[id]/messages/route");
const consents = await import("@/app/api/consents/route");
const revoke = await import("@/app/api/consents/[id]/revoke/route");

const ctx = { params: Promise.resolve({}) };
const WEBM = (n = 4096) => {
  const b = new Uint8Array(n);
  b.set([0x1a, 0x45, 0xdf, 0xa3]);
  return b;
};

function fakeVoice(opts: { transcript?: string; sttError?: VoiceError["code"]; ttsError?: VoiceError["code"] } = {}) {
  const calls = { stt: [] as { bytes: number; filename: string; mime: string }[], tts: [] as string[] };
  const p: VoiceProvider = {
    id: "openai",
    sttModel: "gpt-4o-mini-transcribe",
    ttsModel: "gpt-4o-mini-tts",
    async transcribe(a) {
      calls.stt.push({ bytes: a.bytes.length, filename: a.filename, mime: a.mime });
      if (opts.sttError) throw new VoiceError(opts.sttError, "x");
      return opts.transcript ?? "I've had a stressful week at work.";
    },
    async speak(text) {
      calls.tts.push(text);
      if (opts.ttsError) throw new VoiceError(opts.ttsError, "x");
      return new TextEncoder().encode("ID3-fake-mp3").buffer as ArrayBuffer;
    },
  };
  setVoiceProviderOverride(p);
  return calls;
}

function fakeChat() {
  const calls: GenerateInput[] = [];
  const p: ChatProvider = {
    id: "openai",
    label: "OpenAI test",
    model: "test",
    isGenerative: true,
    async *stream(input) {
      calls.push(input);
      yield "That sounds like **a lot**. ";
      yield "What would help most right now?";
    },
    async complete() {
      return "";
    },
  };
  setProviderOverride(p);
  return calls;
}

function req(url: string, init: { method?: string; body?: BodyInit; json?: unknown; headers?: Record<string, string> } = {}) {
  const body = init.json !== undefined ? JSON.stringify(init.json) : init.body;
  const headers: Record<string, string> = { host: "localhost:3000", ...(init.json !== undefined ? { "content-type": "application/json" } : {}), ...(init.headers ?? {}) };
  return new NextRequest(new URL(url, "http://localhost:3000"), { method: init.method ?? (body ? "POST" : "GET"), body, headers });
}

function audioForm(bytes: Uint8Array, type = "audio/webm;codecs=opus", name = "voice.webm") {
  const form = new FormData();
  form.append("audio", new File([bytes as Uint8Array<ArrayBuffer>], name, { type }));
  return form;
}

async function upload(form: FormData) {
  const res = await transcribe.POST(req("/api/voice/transcribe", { method: "POST", body: form }), ctx);
  return { status: res.status, body: await res.json() };
}

async function newConversation() {
  const res = await conversations.POST(req("/api/conversations", { json: {} }), ctx);
  return (await res.json()).conversation.id as string;
}

async function sendText(conversationId: string, content: string, inputMode: "text" | "voice" = "voice") {
  const res = await messages.POST(req(`/api/conversations/${conversationId}/messages`, { json: { content, inputMode } }), { params: Promise.resolve({ id: conversationId }) });
  const events = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
  return { done: events.find((e) => e.type === "done"), saved: events.find((e) => e.type === "saved") };
}

async function speak(messageId: string, part = 0) {
  return speech.POST(req("/api/voice/speech", { json: { messageId, part } }), ctx);
}

async function consentedPatient() {
  const p = await makePatient();
  current.actor = p;
  await consent.POST(req("/api/voice/consent", { json: {} }), ctx);
  return p;
}

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  current.actor = null;
});
afterEach(() => {
  setVoiceProviderOverride(undefined);
  setProviderOverride(null);
});
afterAll(() => prisma.$disconnect());

describe("Voice access control and consent", () => {
  it("requires a signed-in patient", async () => {
    fakeVoice();
    expect((await upload(audioForm(WEBM()))).status).toBe(401);
    current.actor = await makeClinician();
    expect((await upload(audioForm(WEBM()))).status).toBe(403);
    expect((await speak("x")).status).toBe(403);
  });

  it("requires explicit voice consent, which is recorded, audited and revocable", async () => {
    const calls = fakeVoice();
    const p = await makePatient();
    current.actor = p;
    const status = await (await consent.GET(req("/api/voice/consent"), ctx)).json();
    expect(status).toMatchObject({ available: true, consented: false });

    const blocked = await upload(audioForm(WEBM()));
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("CONSENT_REQUIRED");
    expect(calls.stt).toHaveLength(0);

    expect(await (await consent.POST(req("/api/voice/consent", { json: {} }), ctx)).json()).toMatchObject({ consented: true });
    expect(await prisma.auditLog.count({ where: { action: "CONSENT_GRANTED_VOICE", subjectPatientId: p.patientId } })).toBe(1);
    expect((await upload(audioForm(WEBM()))).status).toBe(200);

    const list = (await (await consents.GET(req("/api/consents"), ctx)).json()).consents;
    const voice = list.find((c: { scope: string }) => c.scope === "VOICE_PROCESSING");
    expect((await revoke.POST(req(`/api/consents/${voice.id}/revoke`, { json: {} }), { params: Promise.resolve({ id: voice.id }) })).status).toBe(200);
    expect((await upload(audioForm(WEBM()))).status).toBe(403);
  });

  it("also requires AI-processing consent", async () => {
    fakeVoice();
    const p = await consentedPatient();
    await prisma.consentRecord.updateMany({ where: { patientId: p.patientId, scope: "AI_PROCESSING" }, data: { revokedAt: new Date() } });
    expect((await upload(audioForm(WEBM()))).status).toBe(403);
  });

  it("reports voice as unavailable (503) when no audio provider is configured", async () => {
    setVoiceProviderOverride(null);
    current.actor = await makePatient();
    expect(await (await consent.GET(req("/api/voice/consent"), ctx)).json()).toMatchObject({ available: false });
    const r = await upload(audioForm(WEBM()));
    expect(r.status).toBe(503);
    expect(r.body.error.message).toMatch(/keep chatting by text/);
  });
});

describe("Transcription", () => {
  it("returns a transcript for review without storing audio or text", async () => {
    const calls = fakeVoice({ transcript: "I've had a stressful week at work." });
    await consentedPatient();
    const r = await upload(audioForm(WEBM(5000)));
    expect(r).toEqual({ status: 200, body: { transcript: "I've had a stressful week at work." } });
    expect(calls.stt[0]).toEqual({ bytes: 5000, filename: "recording.webm", mime: "audio/webm" });
    expect(await prisma.chatMessage.count()).toBe(0);
    expect(JSON.stringify(await prisma.auditLog.findMany())).not.toContain("stressful");
  });

  it("accepts Safari's MP4 recordings", async () => {
    const calls = fakeVoice();
    await consentedPatient();
    const mp4 = new Uint8Array(4096);
    mp4.set([0, 0, 0, 0x20, ...new TextEncoder().encode("ftypM4A ")]);
    expect((await upload(audioForm(mp4, "audio/mp4", "voice.m4a"))).status).toBe(200);
    expect(calls.stt[0].filename).toBe("recording.m4a");
  });

  it("rejects unsupported, mismatched, too-short and too-large uploads before calling the provider", async () => {
    const calls = fakeVoice();
    await consentedPatient();
    expect((await upload(audioForm(WEBM(), "application/pdf", "x.pdf"))).status).toBe(415);
    expect((await upload(audioForm(new Uint8Array(4096).fill(1), "audio/webm"))).status).toBe(415);
    expect((await upload(audioForm(WEBM(200)))).status).toBe(400);
    expect((await upload(audioForm(WEBM(3 * 1024 * 1024 + 10)))).status).toBe(413);
    const missing = new FormData();
    missing.append("note", "no audio");
    expect((await upload(missing)).status).toBe(400);
    expect(calls.stt).toHaveLength(0);
  });

  it("maps provider failures to clear messages and records only an error code", async () => {
    fakeVoice({ sttError: "TIMEOUT" });
    await consentedPatient();
    const r = await upload(audioForm(WEBM()));
    expect(r.status).toBe(503);
    expect(r.body.error.message).toMatch(/type instead/);
    await new Promise((ok) => setTimeout(ok, 50));
    expect(await prisma.systemEvent.count({ where: { kind: "VOICE_ERROR", code: "STT_TIMEOUT" } })).toBe(1);

    fakeVoice({ sttError: "EMPTY" });
    expect((await upload(audioForm(WEBM()))).status).toBe(400);
  });

  it("rate-limits transcription", async () => {
    fakeVoice();
    await consentedPatient();
    for (let i = 0; i < 20; i++) expect((await upload(audioForm(WEBM()))).status).toBe(200);
    expect((await upload(audioForm(WEBM()))).status).toBe(429);
  });
});

describe("Spoken replies", () => {
  it("speaks only the patient's own saved assistant replies, from the stored (safety-checked) text", async () => {
    const voice = fakeVoice();
    fakeChat();
    await consentedPatient();
    const cid = await newConversation();
    const { saved } = await sendText(cid, "I've had a stressful week at work.");

    const res = await speak(saved.assistantMessageId);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(new TextDecoder().decode(await res.arrayBuffer())).toBe("ID3-fake-mp3");
    expect(voice.tts[0]).toBe("That sounds like a lot. What would help most right now?"); // Markdown removed
    expect(res.headers.get("x-speech-parts")).toBe("1");
    expect((await speak(saved.assistantMessageId, 1)).status).toBe(204); // short reply: one part only

    expect((await speak(saved.userMessageId)).status).toBe(400); // never the user's own words
    expect((await speak("does-not-exist")).status).toBe(404);
  });

  it("never speaks another patient's message", async () => {
    fakeVoice();
    fakeChat();
    await consentedPatient();
    const cid = await newConversation();
    const { saved } = await sendText(cid, "Hello");
    await consentedPatient(); // a different patient
    expect((await speak(saved.assistantMessageId)).status).toBe(404);
  });

  it("returns a clear error (text stays visible) when speech synthesis fails", async () => {
    fakeVoice({ ttsError: "UNAVAILABLE" });
    fakeChat();
    await consentedPatient();
    const cid = await newConversation();
    const { saved } = await sendText(cid, "Hello");
    const res = await speak(saved.assistantMessageId);
    expect(res.status).toBe(503);
    expect((await res.json()).error.message).toMatch(/shown as text/);
  });
});

describe("Voice and text share one safe, encrypted conversation", () => {
  it("a multi-turn voice conversation is stored encrypted in the same history as typed messages", async () => {
    fakeVoice();
    const chat = fakeChat();
    await consentedPatient();
    const cid = await newConversation();
    const turns = ["Work has been stressful lately.", "My manager keeps adding deadlines.", "Thank you, that helps."];
    for (const t of turns) {
      const { transcript } = (await upload(audioForm(WEBM()))).body;
      expect(transcript).toBeTruthy();
      await sendText(cid, t); // the transcript (reviewed by the user) goes through the normal chat route
    }
    await sendText(cid, "Typed message after switching to text mode.", "text");
    const stored = await prisma.chatMessage.findMany({ where: { conversationId: cid }, orderBy: { createdAt: "asc" } });
    expect(stored).toHaveLength(8);
    expect(stored.every((m) => m.contentEnc.startsWith("v1:"))).toBe(true);
    expect(stored.map((m) => m.contentEnc).join(" ")).not.toContain("stressful");
    // The model sees the whole shared history on the last (typed) turn.
    expect(chat[chat.length - 1].messages.map((m) => m.content)).toContain("My manager keeps adding deadlines.");
    // Spoken turns ask the model for short spoken replies; the typed turn does not.
    expect(chat[0].system).toMatch(/VOICE CONVERSATION/);
    expect(chat[chat.length - 1].system).not.toMatch(/VOICE CONVERSATION/);
  });

  it("a spoken crisis disclosure bypasses the AI and gets the approved crisis wording, which can be spoken", async () => {
    const voice = fakeVoice({ transcript: "I'm going to kill myself tonight" });
    const chat = fakeChat();
    await consentedPatient();
    const cid = await newConversation();
    const { transcript } = (await upload(audioForm(WEBM()))).body;
    const { done, saved } = await sendText(cid, transcript);
    expect(done.producedBy).toBe("safety-template");
    expect(done.text).toMatch(/998/);
    expect(chat).toHaveLength(0);
    expect(await prisma.safetyEvent.count({ where: { level: "IMMEDIATE_DANGER" } })).toBe(1);
    const first = await speak(saved.assistantMessageId, 0);
    expect(first.status).toBe(200);
    expect(first.headers.get("x-speech-parts")).toBe("2");
    expect((await speak(saved.assistantMessageId, 1)).status).toBe(200);
    expect(voice.tts[0]).toMatch(/call 998/); // the urgent instruction is in the first, quickest part
    expect(voice.tts.join(" ")).toMatch(/outside the UAE/);
    expect(voice.tts.join(" ")).not.toMatch(/\*/);
  });

  it("speech never speaks free text: the endpoint only accepts a message id", async () => {
    fakeVoice();
    await consentedPatient();
    const r = await speech.POST(req("/api/voice/speech", { json: { text: "Say anything I want" } }), ctx);
    expect(r.status).toBe(400);
  });

  it("never speaks a message stored in another patient's conversation", async () => {
    fakeVoice();
    const other = await makePatient("Other");
    const convo = await prisma.conversation.create({ data: { patientId: other.patientId } });
    const msg = await prisma.chatMessage.create({ data: { conversationId: convo.id, role: "ASSISTANT", contentEnc: encrypt("synthetic") } });
    await consentedPatient();
    expect((await speak(msg.id)).status).toBe(404);
  });
});

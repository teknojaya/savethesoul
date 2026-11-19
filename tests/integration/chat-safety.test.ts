import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Actor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { encrypt } from "@/lib/crypto";
import { rateLimit, resetRateLimits } from "@/lib/rate-limit";
import { setProviderOverride } from "@/features/ai/provider-factory";
import { ProviderError, type ChatProvider, type GenerateInput } from "@/features/ai/types";
import { LLM_UNAVAILABLE_RESPONSE } from "@/features/safety/responses";
import { makeClinician, makePatient, resetDb } from "../support/fixtures";

/**
 * Chat route ordering: authentication → validation → ownership → Safety Guardian →
 * (AI consent + AI rate limit) → model. Safety guidance must never depend on the model,
 * the AI rate limit, or the provider being available. All content is synthetic.
 */
const current: { actor: Actor | null } = { actor: null };
vi.mock("@/lib/auth/current-user", () => ({ getCurrentActor: async () => current.actor }));

const conversations = await import("@/app/api/conversations/route");
const messages = await import("@/app/api/conversations/[id]/messages/route");

const CRISIS = "I'm going to kill myself tonight";
const ELEVATED = "I can't go on like this anymore";
const ORDINARY = "Work has been stressful this week";

/** A generative fake that records every call, standing in for OpenAI. */
function fakeProvider(behaviour: "ok" | "fail" = "ok") {
  const calls: GenerateInput[] = [];
  const p: ChatProvider = {
    id: "openai",
    label: "OpenAI test-model",
    model: "test-model",
    isGenerative: true,
    async *stream(input) {
      calls.push(input);
      if (behaviour === "fail") throw new ProviderError("UNAVAILABLE", "down");
      yield "That sounds like a lot to carry. ";
      yield "What has helped a little so far?";
    },
    async complete() {
      return "";
    },
  };
  setProviderOverride(p);
  return calls;
}

const ctx = { params: Promise.resolve({}) };
function req(url: string, body?: unknown) {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method: body === undefined ? "GET" : "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { host: "localhost:3000", "content-type": "application/json" },
  });
}

async function newConversation() {
  const res = await conversations.POST(req("/api/conversations", {}), ctx);
  return (await res.json()).conversation.id as string;
}

async function send(conversationId: string, content: string) {
  const res = await messages.POST(req(`/api/conversations/${conversationId}/messages`, { content }), { params: Promise.resolve({ id: conversationId }) });
  if (res.headers.get("content-type")?.includes("ndjson")) {
    const events = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    return { status: res.status, events, done: events.find((e) => e.type === "done") };
  }
  return { status: res.status, error: (await res.json()).error, events: [], done: undefined };
}

function exhaustAiLimit(userId: string) {
  while (rateLimit(`chat:${userId}`, 30, 60_000)) {
    /* fill the window */
  }
}

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  current.actor = null;
});
afterEach(() => setProviderOverride(null));
afterAll(() => prisma.$disconnect());

describe("Safety Guardian ordering in the chat route", () => {
  it("ordinary messages reach the AI provider and are saved", async () => {
    const calls = fakeProvider();
    current.actor = await makePatient();
    const id = await newConversation();
    const r = await send(id, ORDINARY);
    expect(r.status).toBe(200);
    expect(r.done).toMatchObject({ producedBy: "openai" });
    expect(calls).toHaveLength(1);
    expect(await prisma.chatMessage.count({ where: { conversationId: id } })).toBe(2);
  });

  it("an ordinary message over the AI rate limit is refused with emergency numbers, without calling the AI", async () => {
    const calls = fakeProvider();
    const patient = await makePatient();
    current.actor = patient;
    const id = await newConversation();
    exhaustAiLimit(patient.userId);
    const r = await send(id, ORDINARY);
    expect(r.status).toBe(429);
    expect(r.error.message).toMatch(/998/);
    expect(r.error.message).toMatch(/800-SAKINA/);
    expect(calls).toHaveLength(0);
  });

  it("a crisis message over the AI rate limit still gets crisis guidance (AI not called)", async () => {
    const calls = fakeProvider();
    const patient = await makePatient();
    current.actor = patient;
    const id = await newConversation();
    exhaustAiLimit(patient.userId);
    const r = await send(id, CRISIS);
    expect(r.status).toBe(200);
    expect(r.events.find((e) => e.type === "safety")).toMatchObject({ mode: "crisis" });
    expect(r.done).toMatchObject({ producedBy: "safety-template" });
    expect(r.done.text).toMatch(/998/);
    expect(calls).toHaveLength(0);
    expect(await prisma.safetyEvent.count({ where: { patientId: patient.patientId, level: "IMMEDIATE_DANGER" } })).toBe(1);
  });

  it("an elevated-concern message over the AI rate limit gets the deterministic safety check-in", async () => {
    const calls = fakeProvider();
    const patient = await makePatient();
    current.actor = patient;
    const id = await newConversation();
    exhaustAiLimit(patient.userId);
    const r = await send(id, ELEVATED);
    expect(r.status).toBe(200);
    expect(r.done).toMatchObject({ producedBy: "safety-template" });
    expect(calls).toHaveLength(0);
  });

  it("safety-only answers have their own, higher abuse limit", async () => {
    fakeProvider();
    const patient = await makePatient();
    current.actor = patient;
    const id = await newConversation();
    exhaustAiLimit(patient.userId);
    while (rateLimit(`chat-safety:${patient.userId}`, 60, 60_000)) {
      /* fill the window */
    }
    const r = await send(id, CRISIS);
    expect(r.status).toBe(429);
    expect(r.error.message).toMatch(/998/);
  });

  it("a crisis message gets guidance when the AI provider is down", async () => {
    const calls = fakeProvider("fail");
    current.actor = await makePatient();
    const id = await newConversation();
    const r = await send(id, CRISIS);
    expect(r.done).toMatchObject({ producedBy: "safety-template" });
    expect(r.done.text).toMatch(/998/);
    expect(calls).toHaveLength(0);
  });

  it("an ordinary message when the AI provider is down gets the labelled fallback, never a fake AI reply", async () => {
    fakeProvider("fail");
    current.actor = await makePatient();
    const id = await newConversation();
    const r = await send(id, ORDINARY);
    expect(r.done).toMatchObject({ producedBy: "fallback", text: LLM_UNAVAILABLE_RESPONSE });
    expect(await prisma.systemEvent.count({ where: { kind: "LLM_ERROR", code: "UNAVAILABLE" } })).toBe(1);
  });
});

describe("Consent boundaries for what reaches the AI", () => {
  it("without AI-processing consent, ordinary messages are refused and never sent to the AI", async () => {
    const calls = fakeProvider();
    const patient = await makePatient();
    current.actor = patient;
    const id = await newConversation();
    await prisma.consentRecord.updateMany({ where: { patientId: patient.patientId, scope: "AI_PROCESSING" }, data: { revokedAt: new Date() } });
    const r = await send(id, ORDINARY);
    expect(r.status).toBe(403);
    expect(r.error.message).toMatch(/800-SAKINA/);
    expect(calls).toHaveLength(0);
    expect(await prisma.chatMessage.count({ where: { conversationId: id } })).toBe(0);
  });

  it("without AI-processing consent, a crisis message still gets crisis guidance (AI not called)", async () => {
    const calls = fakeProvider();
    const patient = await makePatient();
    current.actor = patient;
    const id = await newConversation();
    await prisma.consentRecord.updateMany({ where: { patientId: patient.patientId, scope: "AI_PROCESSING" }, data: { revokedAt: new Date() } });
    const r = await send(id, CRISIS);
    expect(r.done).toMatchObject({ producedBy: "safety-template" });
    expect(calls).toHaveLength(0);
  });

  it("saved memories reach the AI only while the patient has memory enabled", async () => {
    const calls = fakeProvider();
    const patient = await makePatient();
    current.actor = patient;
    await prisma.wellbeingMemory.create({ data: { patientId: patient.patientId, contentEnc: encrypt("Synthetic memory: enjoys evening walks") } });
    const id = await newConversation();

    await send(id, ORDINARY);
    expect(calls[0].system).not.toContain("evening walks");

    await prisma.patientProfile.update({ where: { id: patient.patientId }, data: { memoryEnabled: true } });
    await send(id, "Still stressed today");
    expect(calls[1].system).toContain("evening walks");
  });

  it("the AI only receives this patient's own conversation, capped at the last 20 turns", async () => {
    const calls = fakeProvider();
    const other = await makePatient("Other");
    current.actor = other;
    const otherId = await newConversation();
    await send(otherId, "Synthetic: other patient's private message");

    current.actor = await makePatient();
    const id = await newConversation();
    for (let i = 0; i < 12; i++) await send(id, `Synthetic message ${i}`);
    const last = calls[calls.length - 1];
    expect(last.messages.length).toBe(21); // 20 prior turns + the new message
    expect(JSON.stringify(last.messages)).not.toContain("other patient's private message");
  });

  it("other patients and clinicians cannot post into a patient's conversation", async () => {
    fakeProvider();
    current.actor = await makePatient();
    const id = await newConversation();

    current.actor = await makePatient("Intruder");
    expect((await send(id, ORDINARY)).status).toBe(404);

    current.actor = await makeClinician();
    expect((await send(id, ORDINARY)).status).toBe(403);
  });
});

describe("/api/health AI reporting", () => {
  it("reports provider, model and status without secrets or internals", async () => {
    const health = await import("@/app/api/health/route");
    const body = await (await health.GET()).json();
    expect(body.database).toBe("ok");
    expect(body.ai).toMatchObject({ selected: "demo", provider: "demo", status: "demo", generative: false });
    expect(Object.keys(body.ai).sort()).toEqual(["generative", "lastFailureCode", "lastSuccessAt", "model", "provider", "selected", "status"]);
    expect(JSON.stringify(body)).not.toMatch(/sk-|DATA_ENCRYPTION|postgres/i);
  });
});

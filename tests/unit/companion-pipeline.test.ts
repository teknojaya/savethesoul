import { describe, expect, it, vi } from "vitest";
import { runCompanionTurn, type PipelineEvent } from "@/features/ai/companion-pipeline";
import { ProviderError, type ChatProvider, type GenerateInput } from "@/features/ai/types";
import { DemoProvider } from "@/features/ai/demo-provider";
import { LLM_UNAVAILABLE_RESPONSE, OUTPUT_BLOCKED_RESPONSE } from "@/features/safety/responses";

function provider(impl: (input: GenerateInput) => AsyncIterable<string>, isGenerative = true): ChatProvider & { calls: number } {
  const p = {
    id: "fake",
    label: "Fake",
    isGenerative,
    calls: 0,
    stream(input: GenerateInput) {
      p.calls++;
      return impl(input);
    },
    async complete() {
      return "";
    },
  };
  return p;
}

async function collect(gen: AsyncGenerator<PipelineEvent>) {
  const events: PipelineEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

const base = { history: [], memories: [], recentImmediateEvent: false, timeoutMs: 2000 };
const done = (events: PipelineEvent[]) => events.find((e) => e.type === "done") as Extract<PipelineEvent, { type: "done" }>;

describe("Companion pipeline", () => {
  it("streams a normal reply from the provider", async () => {
    const p = provider(async function* () {
      yield "That sounds ";
      yield "hard.";
    });
    const events = await collect(runCompanionTurn({ ...base, provider: p, userText: "Work is stressful" }));
    expect(events[0]).toMatchObject({ type: "safety", mode: "normal" });
    expect(done(events)).toMatchObject({ text: "That sounds hard.", producedBy: "fake" });
  });

  it("bypasses the LLM entirely for explicit immediate danger", async () => {
    const p = provider(async function* () {
      yield "should never be called";
    });
    const events = await collect(runCompanionTurn({ ...base, provider: p, userText: "I'm going to kill myself tonight" }));
    expect(p.calls).toBe(0);
    expect(events[0]).toMatchObject({ type: "safety", mode: "crisis" });
    const d = done(events);
    expect(d.producedBy).toBe("safety-template");
    expect(d.text).toMatch(/998/);
    expect(d.text).toMatch(/800-SAKINA/);
    expect(d.text).not.toMatch(/I have (contacted|called|alerted)/i);
  });

  it("adds the safety-mode instruction for elevated concern", async () => {
    let system = "";
    const p = provider(async function* (input) {
      system = input.system;
      yield "I'm really glad you told me. Are you safe right now?";
    });
    const events = await collect(runCompanionTurn({ ...base, provider: p, userText: "I can't go on anymore" }));
    expect(events[0]).toMatchObject({ mode: "safety-check" });
    expect(system).toMatch(/SAFETY MODE/);
  });

  it("keeps safety mode on after a recent immediate event in the conversation", async () => {
    let system = "";
    const p = provider(async function* (input) {
      system = input.system;
      yield "ok";
    });
    await collect(runCompanionTurn({ ...base, recentImmediateEvent: true, provider: p, userText: "thanks" }));
    expect(system).toMatch(/SAFETY MODE/);
  });

  it("uses the deterministic safety check-in when the provider is not generative", async () => {
    const events = await collect(runCompanionTurn({ ...base, provider: new DemoProvider(0), userText: "I don't want to be here anymore" }));
    const d = done(events);
    expect(d.producedBy).toBe("safety-template");
    expect(d.text).toMatch(/Are you having thoughts of ending your life/);
  });

  describe("LLM outages", () => {
    it("falls back safely when the provider throws before streaming", async () => {
      const p = provider(async function* () {
        throw new ProviderError("UNAVAILABLE", "down");
      });
      const events = await collect(runCompanionTurn({ ...base, provider: p, userText: "hello" }));
      expect(events.some((e) => e.type === "replace" && e.reason === "provider-error")).toBe(true);
      expect(done(events)).toMatchObject({ producedBy: "fallback", providerError: "UNAVAILABLE", text: LLM_UNAVAILABLE_RESPONSE });
    });

    it("replaces a partially streamed reply when the provider fails mid-stream", async () => {
      const p = provider(async function* () {
        yield "Half a sen";
        throw new Error("socket hang up");
      });
      const events = await collect(runCompanionTurn({ ...base, provider: p, userText: "hello" }));
      const d = done(events);
      expect(d.text).toBe(LLM_UNAVAILABLE_RESPONSE);
      expect(d.providerError).toBe("UNKNOWN");
    });

    it("times out a hanging provider and falls back", async () => {
      const p = provider(async function* (input) {
        await new Promise((resolve) => input.signal?.addEventListener("abort", resolve));
        yield "late";
      });
      const events = await collect(runCompanionTurn({ ...base, timeoutMs: 50, provider: p, userText: "hello" }));
      expect(done(events)).toMatchObject({ producedBy: "fallback", providerError: "TIMEOUT" });
    });

    it("uses the elevated-concern fallback (with crisis line) if the LLM fails during a safety check", async () => {
      const p = provider(async function* () {
        throw new ProviderError("TIMEOUT", "slow");
      });
      const events = await collect(runCompanionTurn({ ...base, provider: p, userText: "I want to die" }));
      const d = done(events);
      expect(d.text).toMatch(/800-SAKINA/);
      expect(d.text).toMatch(/in danger right now/);
    });

    it("treats an empty response as a failure", async () => {
      const p = provider(async function* () {
        yield "   ";
      });
      const events = await collect(runCompanionTurn({ ...base, provider: p, userText: "hello" }));
      expect(done(events).producedBy).toBe("fallback");
    });

    it("handles a model refusal with the safe fallback", async () => {
      const p = provider(async function* () {
        throw new ProviderError("REFUSAL", "declined");
      });
      const events = await collect(runCompanionTurn({ ...base, provider: p, userText: "hello" }));
      expect(done(events)).toMatchObject({ producedBy: "fallback", providerError: "REFUSAL" });
    });
  });

  it("replaces model output that crosses clinical boundaries", async () => {
    const p = provider(async function* () {
      yield "Based on what you said, ";
      yield "you have major depression and should take 50mg of sertraline.";
    });
    const events = await collect(runCompanionTurn({ ...base, provider: p, userText: "what's wrong with me" }));
    const d = done(events);
    expect(d.text).toBe(OUTPUT_BLOCKED_RESPONSE);
    expect(d.outputViolations).toEqual(expect.arrayContaining(["DIAGNOSIS"]));
    // The violating text must never be the final message.
    expect(events.some((e) => e.type === "replace" && e.reason === "output-guard")).toBe(true);
  });

  it("includes only user-approved memories and only the last 20 turns", async () => {
    const spy = vi.fn();
    const p = provider(async function* (input) {
      spy(input);
      yield "ok";
    });
    const history = Array.from({ length: 30 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", content: `m${i}` }));
    await collect(runCompanionTurn({ ...base, history, memories: ["Walks help me"], provider: p, userText: "hi" }));
    const input = spy.mock.calls[0][0] as GenerateInput;
    expect(input.messages).toHaveLength(21);
    expect(input.system).toContain("<user_memory>");
    expect(input.system).toContain("Walks help me");
  });
});

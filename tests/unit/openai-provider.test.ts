import http from "node:http";
import type { AddressInfo } from "node:net";
import OpenAI from "openai";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { OpenAIProvider, isReasoningModel } from "@/features/ai/openai-provider";
import { describeProvider, getChatProvider } from "@/features/ai/provider-factory";
import { resetProviderStatus } from "@/features/ai/provider-status";
import { runCompanionTurn, CHAT_MAX_OUTPUT_TOKENS, type PipelineEvent } from "@/features/ai/companion-pipeline";
import { ProviderError } from "@/features/ai/types";
import { resetEnvCache } from "@/lib/env";
import { LLM_UNAVAILABLE_RESPONSE } from "@/features/safety/responses";

/**
 * Exercises the real OpenAI SDK (HTTP + SSE parsing) against a local fake Responses API,
 * so request shape, streaming and error mapping are verified without network access or cost.
 */
type Reply = { status?: number; events?: object[]; json?: object; delayMs?: number };
let next: Reply = {};
const requests: { path: string; body: Record<string, unknown>; auth: string | undefined }[] = [];
let server: http.Server;
let baseURL = "";

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", async () => {
      requests.push({ path: req.url ?? "", body: raw ? JSON.parse(raw) : {}, auth: req.headers.authorization });
      const r = next;
      if (r.delayMs) await new Promise((ok) => setTimeout(ok, r.delayMs));
      if (r.status && r.status !== 200) {
        res.writeHead(r.status, { "content-type": "application/json" });
        res.end(JSON.stringify(r.json ?? { error: { message: "fail", type: "server_error" } }));
        return;
      }
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (const ev of r.events ?? []) res.write(`event: ${(ev as { type: string }).type}\ndata: ${JSON.stringify(ev)}\n\n`);
      res.end();
    });
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
afterAll(() => new Promise<void>((ok) => server.close(() => ok())));
afterEach(() => {
  requests.length = 0;
  next = {};
});

function provider(model = "gpt-5.4-mini", timeoutMs = 5000) {
  const client = new OpenAI({ apiKey: "sk-test-not-real", baseURL, timeout: timeoutMs, maxRetries: 0 });
  return new OpenAIProvider("sk-test-not-real", model, timeoutMs, client);
}
const delta = (text: string) => ({ type: "response.output_text.delta", delta: text, item_id: "m", output_index: 0, content_index: 0, sequence_number: 1, logprobs: [] });
const completed = { type: "response.completed", sequence_number: 9, response: { id: "r", status: "completed", output: [] } };
const input = { system: "You are a supportive companion.", messages: [{ role: "user" as const, content: "I feel stressed" }] };

async function collect(it: AsyncIterable<string>) {
  let s = "";
  for await (const c of it) s += c;
  return s;
}

describe("OpenAIProvider (Responses API)", () => {
  it("streams text deltas and sends a privacy-preserving, capped request", async () => {
    next = { events: [delta("That sounds "), delta("really hard."), completed] };
    const p = provider();
    expect(await collect(p.stream({ ...input, maxTokens: 700 }))).toBe("That sounds really hard.");
    const req = requests[0];
    expect(req.path).toBe("/v1/responses");
    expect(req.auth).toBe("Bearer sk-test-not-real");
    expect(req.body).toMatchObject({
      model: "gpt-5.4-mini",
      instructions: input.system,
      input: [{ role: "user", content: "I feel stressed" }],
      max_output_tokens: 700,
      store: false,
      stream: true,
      reasoning: { effort: "low" },
    });
    expect(p.id).toBe("openai");
    expect(p.label).toBe("OpenAI gpt-5.4-mini");
    expect(p.isGenerative).toBe(true);
  });

  it("omits reasoning settings for non-reasoning models and defaults the output cap", async () => {
    next = { events: [delta("ok"), completed] };
    await collect(provider("gpt-4.1-mini").stream(input));
    expect(requests[0].body.reasoning).toBeUndefined();
    expect(requests[0].body.max_output_tokens).toBe(1500);
    expect(isReasoningModel("gpt-5.4-mini")).toBe(true);
    expect(isReasoningModel("gpt-5.3-chat-latest")).toBe(false);
  });

  it("maps a refusal with no text to REFUSAL", async () => {
    next = { events: [{ type: "response.refusal.delta", delta: "I can't help with that.", item_id: "m", output_index: 0, content_index: 0, sequence_number: 1 }, completed] };
    await expect(collect(provider().stream(input))).rejects.toMatchObject({ code: "REFUSAL" });
  });

  it("maps an empty or failed response to UNAVAILABLE (never an empty reply)", async () => {
    next = { events: [completed] };
    await expect(collect(provider().stream(input))).rejects.toMatchObject({ code: "UNAVAILABLE" });
    next = { events: [{ type: "response.failed", sequence_number: 1, response: { id: "r", status: "failed", output: [] } }] };
    await expect(collect(provider().stream(input))).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });

  it.each([
    [401, "CONFIG"],
    [404, "CONFIG"],
    [429, "RATE_LIMITED"],
    [500, "UNAVAILABLE"],
  ])("maps HTTP %i to %s", async (status, code) => {
    next = { status };
    const err = await collect(provider().stream(input)).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.code).toBe(code);
  });

  it("maps a slow provider to TIMEOUT", async () => {
    next = { delayMs: 400, events: [delta("late"), completed] };
    await expect(collect(provider("gpt-5.4-mini", 100).stream(input))).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("falls back to the labelled safe message in the companion pipeline when OpenAI fails", async () => {
    next = { status: 500 };
    const events: PipelineEvent[] = [];
    for await (const e of runCompanionTurn({ provider: provider(), history: [], userText: "Work has been stressful", memories: [], preferredName: "Sam", recentImmediateEvent: false, timeoutMs: 5000 })) events.push(e);
    const done = events.find((e) => e.type === "done");
    expect(done).toMatchObject({ producedBy: "fallback", text: LLM_UNAVAILABLE_RESPONSE });
    expect(requests[0].body.max_output_tokens).toBe(CHAT_MAX_OUTPUT_TOKENS);
  });

  it("never calls OpenAI for an explicit immediate-danger message (Safety Guardian first)", async () => {
    const events: PipelineEvent[] = [];
    for await (const e of runCompanionTurn({ provider: provider(), history: [], userText: "I'm going to kill myself tonight", memories: [], preferredName: "Sam", recentImmediateEvent: false, timeoutMs: 5000 })) events.push(e);
    expect(requests).toHaveLength(0);
    expect(events.find((e) => e.type === "done")).toMatchObject({ producedBy: "safety-template" });
  });
});

describe("provider selection", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    resetEnvCache();
  });
  function select(env: Record<string, string | undefined>) {
    for (const k of ["LLM_PROVIDER", "LLM_MODEL", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"]) delete process.env[k];
    Object.assign(process.env, env);
    resetEnvCache();
    const p = getChatProvider();
    return { id: p.id, label: p.label };
  }

  it("uses OpenAI with the configured model", () => {
    expect(select({ LLM_PROVIDER: "openai", OPENAI_API_KEY: "x", LLM_MODEL: "gpt-5.4-nano" })).toEqual({ id: "openai", label: "OpenAI gpt-5.4-nano" });
  });
  it("uses the OpenAI default model when LLM_MODEL is unset", () => {
    expect(select({ LLM_PROVIDER: "openai", OPENAI_API_KEY: "x" }).label).toBe("OpenAI gpt-5.4-mini");
  });
  it("auto prefers OpenAI, then Anthropic, then the demo", () => {
    expect(select({ LLM_PROVIDER: "auto", OPENAI_API_KEY: "x", ANTHROPIC_API_KEY: "y" }).id).toBe("openai");
    expect(select({ LLM_PROVIDER: "auto", ANTHROPIC_API_KEY: "y" }).id).toBe("anthropic");
    expect(select({ LLM_PROVIDER: "auto" }).id).toBe("demo");
  });
  it("falls back to the labelled demo when OpenAI is selected without a key", () => {
    expect(select({ LLM_PROVIDER: "openai" }).id).toBe("demo");
  });
});

describe("AI status reporting (/api/health)", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    resetEnvCache();
    resetProviderStatus();
  });
  function configure(env: Record<string, string>) {
    for (const k of ["LLM_PROVIDER", "LLM_MODEL", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_BASE_URL"]) delete process.env[k];
    Object.assign(process.env, env);
    resetEnvCache();
  }
  const real = () => ({ LLM_PROVIDER: "openai", OPENAI_API_KEY: "sk-test-not-real", LLM_MODEL: "gpt-5.4-mini", OPENAI_BASE_URL: baseURL });

  it("reports an explicit demo choice as demo", () => {
    configure({ LLM_PROVIDER: "demo" });
    expect(describeProvider()).toMatchObject({ selected: "demo", id: "demo", status: "demo", isGenerative: false });
  });

  it("reports OpenAI selected without a key as missing_key (labelled demo fallback, never Anthropic)", () => {
    configure({ LLM_PROVIDER: "openai", ANTHROPIC_API_KEY: "y" });
    expect(describeProvider()).toMatchObject({ selected: "openai", id: "demo", status: "missing_key" });
  });

  it("does not treat a configured key as proof: configured_untested until a real reply succeeds", () => {
    configure(real());
    expect(describeProvider()).toMatchObject({ id: "openai", model: "gpt-5.4-mini", status: "configured_untested", lastSuccessAt: null });
  });

  it("becomes verified after a successful streamed reply, and unavailable after a failure", async () => {
    configure(real());
    next = { events: [delta("Hello"), completed] };
    await collect(getChatProvider().stream(input));
    expect(describeProvider()).toMatchObject({ status: "verified", lastFailureCode: null });
    expect(describeProvider().lastSuccessAt).toEqual(expect.any(String));

    next = { status: 401 };
    await collect(getChatProvider().stream(input)).catch(() => {});
    expect(describeProvider()).toMatchObject({ status: "unavailable", lastFailureCode: "CONFIG" });

    next = { events: [delta("Back"), completed] };
    await collect(getChatProvider().stream(input));
    expect(describeProvider().status).toBe("verified");
  });

  it("never exposes the API key", () => {
    configure(real());
    expect(JSON.stringify(describeProvider())).not.toContain("sk-test-not-real");
  });

  it("demo data mode does not force demo AI: DEMO_MODE=true with a key still uses OpenAI", () => {
    configure({ ...real(), DEMO_MODE: "true" });
    expect(getChatProvider().id).toBe("openai");
  });
});

import { getEnv } from "@/lib/env";
import { AnthropicProvider } from "./anthropic-provider";
import { OpenAIProvider, OPENAI_DEFAULT_MODEL } from "./openai-provider";
import { DemoProvider } from "./demo-provider";
import type { ChatProvider } from "./types";
import { liveStatus } from "./provider-status";

const ANTHROPIC_DEFAULT_MODEL = "claude-opus-5-5";

let override: ChatProvider | null = null;

/** Test hook: force a specific provider (e.g. a failing one). */
export function setProviderOverride(p: ChatProvider | null) {
  override = p;
}

/**
 * LLM_PROVIDER:
 *  - "openai" / "anthropic": that provider (needs its API key, otherwise the labelled demo)
 *  - "auto": OpenAI if OPENAI_API_KEY is set, else Anthropic if ANTHROPIC_API_KEY is set, else demo
 *  - "demo": the offline, clearly labelled demo companion
 */
export function getChatProvider(): ChatProvider {
  if (override) return override;
  const env = getEnv();
  const choice =
    env.LLM_PROVIDER === "auto" ? (env.OPENAI_API_KEY ? "openai" : env.ANTHROPIC_API_KEY ? "anthropic" : "demo") : env.LLM_PROVIDER;

  if (choice === "openai" && env.OPENAI_API_KEY) {
    return new OpenAIProvider(env.OPENAI_API_KEY, env.LLM_MODEL ?? OPENAI_DEFAULT_MODEL, env.LLM_TIMEOUT_MS);
  }
  if (choice === "anthropic" && env.ANTHROPIC_API_KEY) {
    return new AnthropicProvider(env.ANTHROPIC_API_KEY, env.LLM_MODEL ?? ANTHROPIC_DEFAULT_MODEL, env.LLM_TIMEOUT_MS);
  }
  return new DemoProvider();
}

export type AiStatus = "demo" | "missing_key" | "configured_untested" | "verified" | "unavailable";

/**
 * Public, non-secret description of the AI configuration for /api/health and the UI.
 * - demo:                the labelled offline companion was chosen deliberately (or auto found no key)
 * - missing_key:         a real provider was selected but its key is absent → labelled demo fallback
 * - configured_untested: key present, no real request has completed in this server process yet
 * - verified:            the most recent real request returned model output
 * - unavailable:         the most recent real request failed (code only, e.g. TIMEOUT, CONFIG)
 */
export function describeProvider() {
  const env = getEnv();
  const p = getChatProvider();
  const base = { selected: env.LLM_PROVIDER, id: p.id, label: p.label, model: p.model ?? null, isGenerative: p.isGenerative };
  if (!p.isGenerative || !p.model) {
    const status: AiStatus = env.LLM_PROVIDER === "openai" || env.LLM_PROVIDER === "anthropic" ? "missing_key" : "demo";
    return { ...base, status, lastSuccessAt: null, lastFailureCode: null };
  }
  return { ...base, ...liveStatus(p.id, p.model) };
}

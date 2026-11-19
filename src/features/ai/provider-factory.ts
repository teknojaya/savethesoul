import { getEnv } from "@/lib/env";
import { AnthropicProvider } from "./anthropic-provider";
import { OpenAIProvider, OPENAI_DEFAULT_MODEL } from "./openai-provider";
import { DemoProvider } from "./demo-provider";
import type { ChatProvider } from "./types";

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

export function describeProvider() {
  const p = getChatProvider();
  return { id: p.id, label: p.label, isGenerative: p.isGenerative };
}

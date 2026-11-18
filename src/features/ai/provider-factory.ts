import { getEnv } from "@/lib/env";
import { AnthropicProvider } from "./anthropic-provider";
import { DemoProvider } from "./demo-provider";
import type { ChatProvider } from "./types";

let override: ChatProvider | null = null;

/** Test hook: force a specific provider (e.g. a failing one). */
export function setProviderOverride(p: ChatProvider | null) {
  override = p;
}

export function getChatProvider(): ChatProvider {
  if (override) return override;
  const env = getEnv();
  const wantsAnthropic =
    env.LLM_PROVIDER === "anthropic" || (env.LLM_PROVIDER === "auto" && !!env.ANTHROPIC_API_KEY);
  if (wantsAnthropic && env.ANTHROPIC_API_KEY) {
    return new AnthropicProvider(env.ANTHROPIC_API_KEY, env.LLM_MODEL, env.LLM_TIMEOUT_MS);
  }
  return new DemoProvider();
}

export function describeProvider() {
  const p = getChatProvider();
  return { id: p.id, label: p.label, isGenerative: p.isGenerative };
}

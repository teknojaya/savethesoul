import Anthropic from "@anthropic-ai/sdk";
import { ProviderError, type ChatProvider, type GenerateInput } from "./types";

/**
 * Claude via the official Anthropic SDK (server-side only).
 *
 * - Streams text deltas.
 * - `effort: "low"` keeps conversational replies fast; adaptive thinking is the model default.
 * - Server-side refusal fallback ("default") so a policy decline is retried on the
 *   server-defined fallback model instead of leaving the user without a reply.
 */
export class AnthropicProvider implements ChatProvider {
  readonly id = "anthropic";
  readonly label = "Claude (Anthropic)";
  readonly isGenerative = true;
  private client: Anthropic;

  constructor(
    apiKey: string,
    private model: string,
    timeoutMs: number,
  ) {
    this.client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 1 });
  }

  private params(input: GenerateInput) {
    return {
      model: this.model,
      max_tokens: input.maxTokens ?? 16000,
      system: input.system,
      messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
      output_config: { effort: "low" as const },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default" as const,
    };
  }

  async *stream(input: GenerateInput): AsyncIterable<string> {
    let emitted = false;
    try {
      const stream = this.client.beta.messages.stream(this.params(input), { signal: input.signal });
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          emitted = true;
          yield event.delta.text;
        }
      }
      const final = await stream.finalMessage();
      if (final.stop_reason === "refusal" && !emitted) {
        throw new ProviderError("REFUSAL", "Model declined to respond");
      }
    } catch (err) {
      throw mapError(err);
    }
  }

  async complete(input: GenerateInput): Promise<string> {
    let out = "";
    for await (const chunk of this.stream(input)) out += chunk;
    return out;
  }
}

function mapError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new ProviderError("TIMEOUT", "Model request timed out");
  if (err instanceof Anthropic.APIUserAbortError) return new ProviderError("TIMEOUT", "Model request aborted");
  if (err instanceof Anthropic.RateLimitError) return new ProviderError("RATE_LIMITED", "Model rate limited");
  if (err instanceof Anthropic.AuthenticationError) return new ProviderError("CONFIG", "Model authentication failed");
  if (err instanceof Anthropic.APIConnectionError) return new ProviderError("UNAVAILABLE", "Model connection failed");
  if (err instanceof Anthropic.APIError) return new ProviderError("UNAVAILABLE", `Model API error ${err.status ?? ""}`.trim());
  return new ProviderError("UNKNOWN", "Unexpected model error");
}

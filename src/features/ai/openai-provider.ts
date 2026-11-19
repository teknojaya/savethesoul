import OpenAI from "openai";
import { ProviderError, type ChatProvider, type GenerateInput } from "./types";

export const OPENAI_DEFAULT_MODEL = "gpt-5.4-mini";

/**
 * GPT via the official OpenAI SDK and the Responses API (server-side only).
 *
 * - Streams `response.output_text.delta` events.
 * - `store: false`: responses are not retained by OpenAI for later retrieval.
 * - Reasoning models run at low effort to keep replies fast and cheap; output is capped by
 *   `max_output_tokens` (which includes reasoning tokens).
 * - A refusal or an empty/failed response becomes a ProviderError, so the companion pipeline
 *   shows its labelled fallback instead of an empty or fabricated reply.
 */
export class OpenAIProvider implements ChatProvider {
  readonly id = "openai";
  readonly label: string;
  readonly isGenerative = true;
  private client: OpenAI;

  constructor(
    apiKey: string,
    private model: string,
    timeoutMs: number,
    client?: OpenAI,
  ) {
    this.client = client ?? new OpenAI({ apiKey, timeout: timeoutMs, maxRetries: 1 });
    this.label = `OpenAI ${model}`;
  }

  private params(input: GenerateInput) {
    const reasoning = isReasoningModel(this.model) ? { reasoning: { effort: "low" as const } } : {};
    return {
      model: this.model,
      instructions: input.system,
      input: input.messages.map((m) => ({ role: m.role, content: m.content })),
      max_output_tokens: input.maxTokens ?? 1500,
      store: false,
      stream: true as const,
      ...reasoning,
    };
  }

  async *stream(input: GenerateInput): AsyncIterable<string> {
    let emitted = false;
    let refused = false;
    try {
      const stream = await this.client.responses.create(this.params(input), { signal: input.signal });
      for await (const event of stream) {
        switch (event.type) {
          case "response.output_text.delta":
            if (event.delta) {
              emitted = true;
              yield event.delta;
            }
            break;
          case "response.refusal.delta":
            refused = true;
            break;
          case "response.failed":
            throw new ProviderError("UNAVAILABLE", "Model response failed");
          case "error":
            throw new ProviderError("UNAVAILABLE", "Model stream error");
        }
      }
    } catch (err) {
      throw mapError(err);
    }
    if (!emitted) {
      throw refused
        ? new ProviderError("REFUSAL", "Model declined to respond")
        : new ProviderError("UNAVAILABLE", "Model returned no text");
    }
  }

  async complete(input: GenerateInput): Promise<string> {
    let out = "";
    for await (const chunk of this.stream(input)) out += chunk;
    return out;
  }
}

/** GPT-5+ and o-series models accept a reasoning effort; older chat models reject it. */
export function isReasoningModel(model: string): boolean {
  return /^(gpt-[5-9]|o\d)/.test(model) && !model.includes("chat-latest");
}

function mapError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof OpenAI.APIConnectionTimeoutError) return new ProviderError("TIMEOUT", "Model request timed out");
  if (err instanceof OpenAI.APIUserAbortError) return new ProviderError("TIMEOUT", "Model request aborted");
  if (err instanceof OpenAI.RateLimitError) return new ProviderError("RATE_LIMITED", "Model rate limited");
  if (err instanceof OpenAI.AuthenticationError || err instanceof OpenAI.PermissionDeniedError || err instanceof OpenAI.NotFoundError) {
    return new ProviderError("CONFIG", "Model configuration or authentication failed");
  }
  if (err instanceof OpenAI.APIConnectionError) return new ProviderError("UNAVAILABLE", "Model connection failed");
  if (err instanceof OpenAI.APIError) return new ProviderError("UNAVAILABLE", `Model API error ${err.status ?? ""}`.trim());
  return new ProviderError("UNKNOWN", "Unexpected model error");
}

import { ProviderError, type ChatProvider } from "./types";

/**
 * Used when a message may not reach the language model (AI rate limit reached, or no
 * active AI-processing consent) but the Safety Guardian flagged it. Being non-generative,
 * the companion pipeline answers IMMEDIATE and ELEVATED messages with deterministic safety
 * templates and never calls `stream`. Unflagged messages are rejected before this point.
 */
export class SafetyOnlyProvider implements ChatProvider {
  readonly id = "safety-only";
  readonly label = "Safety resources (AI not used)";
  readonly isGenerative = false;
  async *stream(): AsyncIterable<string> {
    throw new ProviderError("CONFIG", "AI generation is not permitted for this message");
  }
  async complete(): Promise<string> {
    throw new ProviderError("CONFIG", "AI generation is not permitted for this message");
  }
}

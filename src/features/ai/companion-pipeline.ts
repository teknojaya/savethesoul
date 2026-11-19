import { assessMessage, checkModelOutput, type SafetyAssessment } from "@/features/safety/classifier";
import {
  elevatedConcernFallback,
  immediateDangerResponse,
  LLM_UNAVAILABLE_RESPONSE,
  OUTPUT_BLOCKED_RESPONSE,
} from "@/features/safety/responses";
import { buildCompanionSystem } from "./prompts";
import { ProviderError, type ChatProvider, type ChatTurn } from "./types";

/** Cost control: a companion reply (including any reasoning tokens) never exceeds this. */
export const CHAT_MAX_OUTPUT_TOKENS = 1500;

export type ResponseMode = "crisis" | "safety-check" | "normal";

export type PipelineEvent =
  | { type: "safety"; assessment: SafetyAssessment; mode: ResponseMode }
  | { type: "delta"; text: string }
  | { type: "replace"; text: string; reason: "output-guard" | "provider-error" }
  | {
      type: "done";
      text: string;
      /** "safety-template" | "fallback" | provider id */
      producedBy: string;
      providerError?: ProviderError["code"];
      outputViolations?: string[];
    };

export interface PipelineInput {
  provider: ChatProvider;
  history: ChatTurn[];
  userText: string;
  memories: string[];
  preferredName?: string;
  /** True if this conversation had an IMMEDIATE event recently — keeps safety mode on. */
  recentImmediateEvent: boolean;
  timeoutMs: number;
  /** The user spoke this message in Voice Mode; the reply will be read aloud. */
  spoken?: boolean;
}

/**
 * One companion turn, with defence-in-depth safety:
 *   1. Classify user input (deterministic, no LLM).
 *   2. IMMEDIATE  → deterministic crisis response. The LLM is NOT called.
 *      ELEVATED   → LLM in safety mode; deterministic safety-check fallback if it fails.
 *      NO_FLAG    → normal LLM reply (NO_FLAG is not evidence of safety).
 *   3. Check model output; replace it if it violates clinical boundaries.
 *   4. Any provider failure yields a safe template that still shows human help options.
 */
export async function* runCompanionTurn(input: PipelineInput): AsyncGenerator<PipelineEvent> {
  const assessment = assessMessage(input.userText);

  if (assessment.level === "IMMEDIATE_DANGER") {
    yield { type: "safety", assessment, mode: "crisis" };
    const text = immediateDangerResponse(assessment);
    yield { type: "delta", text };
    yield { type: "done", text, producedBy: "safety-template" };
    return;
  }

  const safetyMode = assessment.level === "ELEVATED_CONCERN" || input.recentImmediateEvent;
  yield { type: "safety", assessment, mode: assessment.level === "ELEVATED_CONCERN" ? "safety-check" : "normal" };

  // A non-generative (offline demo) provider cannot follow the safety-mode instruction,
  // so concerning language always receives the deterministic safety check-in instead.
  if (assessment.level === "ELEVATED_CONCERN" && !input.provider.isGenerative) {
    const text = elevatedConcernFallback(assessment);
    yield { type: "delta", text };
    yield { type: "done", text, producedBy: "safety-template" };
    return;
  }

  const system = buildCompanionSystem({
    memories: input.memories,
    safetyMode,
    spoken: input.spoken,
    preferredName: input.preferredName,
  });
  const messages: ChatTurn[] = [...input.history.slice(-20), { role: "user", content: input.userText }];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  let text = "";
  try {
    for await (const chunk of input.provider.stream({ system, messages, signal: controller.signal, maxTokens: CHAT_MAX_OUTPUT_TOKENS })) {
      if (controller.signal.aborted) throw new ProviderError("TIMEOUT", "Timed out");
      text += chunk;
      const violations = checkModelOutput(text);
      if (violations.length) {
        yield { type: "replace", text: OUTPUT_BLOCKED_RESPONSE, reason: "output-guard" };
        yield { type: "done", text: OUTPUT_BLOCKED_RESPONSE, producedBy: "fallback", outputViolations: violations };
        return;
      }
      yield { type: "delta", text: chunk };
    }
    if (controller.signal.aborted) throw new ProviderError("TIMEOUT", "Timed out");
    if (!text.trim()) throw new ProviderError("UNAVAILABLE", "Empty response");
    yield { type: "done", text, producedBy: input.provider.id };
  } catch (err) {
    const code = err instanceof ProviderError ? err.code : "UNKNOWN";
    const fallback =
      assessment.level === "ELEVATED_CONCERN" ? elevatedConcernFallback(assessment) : LLM_UNAVAILABLE_RESPONSE;
    // If partial text was streamed, the client replaces it; we never leave a half reply.
    yield { type: "replace", text: fallback, reason: "provider-error" };
    yield { type: "done", text: fallback, producedBy: "fallback", providerError: code };
  } finally {
    clearTimeout(timer);
  }
}

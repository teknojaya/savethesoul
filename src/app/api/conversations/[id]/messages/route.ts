import { route, param, parseJson } from "@/lib/http";
import { SendMessageSchema } from "@/lib/validation/schemas";
import { requirePatient } from "@/server/services/access.service";
import { assertConversationOwned, sendMessage } from "@/server/services/conversation.service";
import { rateLimit } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";
import { LLM_UNAVAILABLE_RESPONSE } from "@/features/safety/responses";
import { assessMessage } from "@/features/safety/classifier";
import { hasAiProcessingConsent } from "@/server/services/consent.service";

const URGENT_HELP = "If you need urgent help in the UAE, call 998 (ambulance), 999 (police) or 800-SAKINA (800 725462); elsewhere, call your local emergency number. The Help page is always available.";
/** Ordinary AI replies per patient per minute (cost and abuse control). */
const AI_LIMIT_PER_MIN = 30;
/** Safety-flagged messages are answered without the AI, under a separate, higher limit. */
const SAFETY_LIMIT_PER_MIN = 60;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Streams a companion turn as NDJSON: one JSON event per line
 * (safety → delta… → [replace] → done → saved). If anything fails mid-stream,
 * a final safe fallback event is emitted so the client never shows a broken reply.
 */
export const POST = route({ roles: ["PATIENT"] }, async ({ req, actor, params }) => {
  const patientId = requirePatient(actor);
  const conversationId = param(params, "id");
  const { content } = await parseJson(req, SendMessageSchema);
  await assertConversationOwned(patientId, conversationId);

  // Safety Guardian first: deterministic, no AI, no cost. A message that may signal danger
  // is always answered with safety guidance, even when the AI limit is reached or AI
  // processing is not permitted; only the paid model call is withheld.
  const flagged = assessMessage(content).level !== "NO_FLAG";
  const aiConsent = await hasAiProcessingConsent(patientId);
  const withinAiLimit = rateLimit(`chat:${actor.userId}`, AI_LIMIT_PER_MIN, 60_000);
  if (!flagged) {
    if (!aiConsent) throw new AppError("FORBIDDEN", `The AI companion needs your consent to process messages (Profile & Privacy). ${URGENT_HELP}`);
    if (!withinAiLimit) throw new AppError("RATE_LIMITED", `You're sending messages very quickly. Please pause for a moment. ${URGENT_HELP}`);
  } else if (!withinAiLimit && !rateLimit(`chat-safety:${actor.userId}`, SAFETY_LIMIT_PER_MIN, 60_000)) {
    throw new AppError("RATE_LIMITED", `Too many messages. ${URGENT_HELP}`);
  }
  const aiAllowed = aiConsent && withinAiLimit;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        for await (const ev of sendMessage(patientId, conversationId, content, { aiAllowed })) send(ev);
      } catch (err) {
        console.error("[chat] stream failed:", err instanceof Error ? err.name : "unknown");
        send({ type: "replace", text: LLM_UNAVAILABLE_RESPONSE, reason: "provider-error" });
        send({ type: "done", text: LLM_UNAVAILABLE_RESPONSE, producedBy: "fallback", providerError: "UNKNOWN" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
});

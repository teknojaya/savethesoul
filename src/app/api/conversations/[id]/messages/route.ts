import { route, param, parseJson } from "@/lib/http";
import { SendMessageSchema } from "@/lib/validation/schemas";
import { requirePatient } from "@/server/services/access.service";
import { assertConversationOwned, sendMessage } from "@/server/services/conversation.service";
import { rateLimit } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";
import { LLM_UNAVAILABLE_RESPONSE } from "@/features/safety/responses";

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
  if (!rateLimit(`chat:${actor.userId}`, 30, 60_000)) {
    throw new AppError("RATE_LIMITED", "You're sending messages very quickly. Please pause for a moment.");
  }
  await assertConversationOwned(patientId, conversationId);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        for await (const ev of sendMessage(patientId, conversationId, content)) send(ev);
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

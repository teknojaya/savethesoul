import { prisma } from "@/lib/db/prisma";
import { decrypt } from "@/lib/crypto";
import { getEnv } from "@/lib/env";
import { notFound } from "@/lib/errors";
import { runCompanionTurn, type PipelineEvent } from "@/features/ai/companion-pipeline";
import { getChatProvider } from "@/features/ai/provider-factory";
import { SafetyOnlyProvider } from "@/features/ai/safety-only-provider";
import type { ChatTurn } from "@/features/ai/types";
import * as repo from "../repositories/conversation.repo";
import { recordSystemEvent } from "./audit.service";

export async function listConversations(patientId: string) {
  await purgeStaleEphemeral(patientId);
  return repo.listConversations(patientId);
}

export async function startConversation(patientId: string) {
  const profile = await prisma.patientProfile.findUniqueOrThrow({ where: { id: patientId } });
  // When history is off, each new conversation replaces the previous ephemeral one.
  if (!profile.chatHistoryEnabled) {
    await prisma.conversation.deleteMany({ where: { patientId, ephemeral: true } });
  }
  return repo.createConversation(patientId, !profile.chatHistoryEnabled);
}

export async function getConversation(patientId: string, conversationId: string) {
  const convo = await repo.findOwnedConversation(patientId, conversationId);
  if (!convo) throw notFound("Conversation not found");
  const messages = await repo.getMessages(conversationId);
  return { ...convo, messages };
}

export async function assertConversationOwned(patientId: string, conversationId: string) {
  const convo = await repo.findOwnedConversation(patientId, conversationId);
  if (!convo) throw notFound("Conversation not found");
}

export async function deleteConversation(patientId: string, conversationId: string) {
  const res = await prisma.conversation.deleteMany({ where: { id: conversationId, patientId } });
  if (res.count === 0) throw notFound("Conversation not found");
}

export async function deleteAllConversations(patientId: string) {
  const res = await prisma.conversation.deleteMany({ where: { patientId } });
  return res.count;
}

async function purgeStaleEphemeral(patientId: string) {
  await prisma.conversation.deleteMany({
    where: { patientId, ephemeral: true, updatedAt: { lt: new Date(Date.now() - 24 * 3600_000) } },
  });
}

export type StreamEvent =
  | PipelineEvent
  | { type: "saved"; userMessageId: string; assistantMessageId: string; safetyEventId: string | null };

/**
 * Runs one companion turn and persists results. Yields events for streaming to the client.
 * Message text is persisted encrypted; safety events record categories only.
 */
export async function* sendMessage(
  patientId: string,
  conversationId: string,
  content: string,
  opts: { aiAllowed?: boolean; spoken?: boolean } = {},
): AsyncGenerator<StreamEvent> {
  const convo = await repo.findOwnedConversation(patientId, conversationId);
  if (!convo) throw notFound("Conversation not found");

  const profile = await prisma.patientProfile.findUniqueOrThrow({
    where: { id: patientId },
    include: { memories: { orderBy: { createdAt: "asc" }, take: 30 } },
  });

  const prior = await repo.getMessages(conversationId);
  const history: ChatTurn[] = prior
    .filter((m) => m.role !== "SAFETY")
    .map((m) => ({ role: m.role === "USER" ? "user" : "assistant", content: m.content }));

  const recentImmediate = await prisma.safetyEvent.count({
    where: { conversationId, level: "IMMEDIATE_DANGER", createdAt: { gt: new Date(Date.now() - 2 * 3600_000) } },
  });

  const userMsg = await repo.addMessage(conversationId, "USER", content);
  if (prior.length === 0) {
    // Titles are stored unencrypted, so they must never contain message text.
    await repo.setTitle(conversationId, dateTitle(new Date()));
  }

  const env = getEnv();
  // Without AI permission (rate limit or consent) only deterministic safety responses are possible.
  const provider = opts.aiAllowed === false ? new SafetyOnlyProvider() : getChatProvider();
  let safetyEventId: string | null = null;
  let finalText = "";
  let producedBy = provider.id;
  let crisis = false;

  for await (const ev of runCompanionTurn({
    provider,
    history,
    userText: content,
    memories: profile.memoryEnabled ? profile.memories.map((m) => decrypt(m.contentEnc)) : [],
    preferredName: profile.preferredName,
    recentImmediateEvent: recentImmediate > 0,
    timeoutMs: env.LLM_TIMEOUT_MS,
    spoken: opts.spoken,
  })) {
    if (ev.type === "safety" && ev.assessment.level !== "NO_FLAG") {
      crisis = ev.mode === "crisis";
      const se = await prisma.safetyEvent.create({
        data: {
          patientId,
          conversationId,
          level: ev.assessment.level,
          source: "CHAT_INPUT",
          detector: ev.assessment.detector,
          categories: ev.assessment.categories,
        },
      });
      safetyEventId = se.id;
    }
    if (ev.type === "done") {
      finalText = ev.text;
      producedBy = ev.producedBy;
      if (ev.providerError) await recordSystemEvent("LLM_ERROR", ev.providerError);
      if (ev.outputViolations?.length) await recordSystemEvent("OUTPUT_GUARD", ev.outputViolations.join(","));
    }
    yield ev;
  }

  const assistant = await repo.addMessage(conversationId, crisis ? "SAFETY" : "ASSISTANT", finalText, producedBy);
  yield { type: "saved", userMessageId: userMsg.id, assistantMessageId: assistant.id, safetyEventId };
}

function dateTitle(d: Date): string {
  return `Conversation · ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai" })}`;
}

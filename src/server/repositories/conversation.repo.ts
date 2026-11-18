import { prisma } from "@/lib/db/prisma";
import { decrypt, encrypt } from "@/lib/crypto";
import type { MessageRole } from "@/generated/prisma/enums";

/** Data access for conversations. Encryption/decryption happens at this boundary. */

export async function listConversations(patientId: string) {
  return prisma.conversation.findMany({
    where: { patientId, ephemeral: false },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, createdAt: true, updatedAt: true, _count: { select: { messages: true } } },
  });
}

export async function findOwnedConversation(patientId: string, conversationId: string) {
  return prisma.conversation.findFirst({ where: { id: conversationId, patientId } });
}

export async function getMessages(conversationId: string) {
  const rows = await prisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    content: decrypt(r.contentEnc),
    provider: r.provider,
    createdAt: r.createdAt,
  }));
}

export async function addMessage(conversationId: string, role: MessageRole, content: string, provider?: string) {
  const msg = await prisma.chatMessage.create({
    data: { conversationId, role, contentEnc: encrypt(content), provider: provider ?? null },
  });
  await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
  return msg;
}

export async function createConversation(patientId: string, ephemeral: boolean) {
  return prisma.conversation.create({ data: { patientId, ephemeral } });
}

export async function setTitle(conversationId: string, title: string) {
  await prisma.conversation.update({ where: { id: conversationId }, data: { title } });
}

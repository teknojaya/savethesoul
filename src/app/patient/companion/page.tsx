import { requirePatientPage } from "@/lib/auth/current-user";
import { getEnv } from "@/lib/env";
import { listConversations, getConversation } from "@/server/services/conversation.service";
import { getPatientProfile } from "@/server/services/patient.service";
import { describeProvider } from "@/features/ai/provider-factory";
import { CompanionChat } from "@/components/chat/companion-chat";

export const metadata = { title: "AI Companion" };

export default async function CompanionPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const actor = await requirePatientPage();
  const { c } = await searchParams;
  const [profile, conversations] = await Promise.all([getPatientProfile(actor.patientId), listConversations(actor.patientId)]);

  let initial: { id: string; messages: { id: string; role: string; content: string; provider: string | null }[] } | null = null;
  if (c) {
    try {
      const convo = await getConversation(actor.patientId, c);
      initial = {
        id: convo.id,
        messages: convo.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, provider: m.provider })),
      };
    } catch {
      initial = null;
    }
  }

  return (
    <CompanionChat
      key={initial?.id ?? "new"}
      preferredName={profile.preferredName}
      provider={describeProvider()}
      memoryEnabled={profile.memoryEnabled}
      historyEnabled={profile.chatHistoryEnabled}
      demoMode={getEnv().DEMO_MODE}
      conversations={conversations.map((x) => ({ id: x.id, title: x.title, updatedAt: x.updatedAt.toISOString(), count: x._count.messages }))}
      initial={initial}
    />
  );
}

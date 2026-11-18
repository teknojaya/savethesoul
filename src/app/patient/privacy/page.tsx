import { requirePatientPage } from "@/lib/auth/current-user";
import { getPatientProfile } from "@/server/services/patient.service";
import { listConsentsWithNames } from "@/server/services/consent.service";
import { listMemories } from "@/server/services/wellbeing.service";
import { listAccessToMyData } from "@/server/services/audit.service";
import { PageHeader } from "@/components/ui/primitives";
import { PrivacyControls } from "@/components/privacy/privacy-controls";

export const metadata = { title: "Profile & Privacy" };

export default async function PrivacyPage() {
  const actor = await requirePatientPage();
  const [profile, consents, memories, access] = await Promise.all([
    getPatientProfile(actor.patientId),
    listConsentsWithNames(actor.patientId),
    listMemories(actor.patientId),
    listAccessToMyData(actor.patientId, 30),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow="Profile & privacy"
        title="Your data, your decisions"
        description="Everything here takes effect immediately and is enforced on our server — not just hidden in the app."
      />
      <PrivacyControls
        profile={profile}
        memories={memories.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() }))}
        consents={consents.map((c) => ({
          id: c.id,
          scope: c.scope,
          granteeName: c.granteeName,
          categories: c.categories,
          grantedAt: c.grantedAt.toISOString(),
          revokedAt: c.revokedAt?.toISOString() ?? null,
          policyVersion: c.policyVersion,
        }))}
        access={access.map((a) => ({
          id: a.id,
          who: a.actor?.displayName ?? "Unknown",
          action: a.action,
          outcome: a.outcome,
          createdAt: a.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}

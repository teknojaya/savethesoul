import { requirePatientPage } from "@/lib/auth/current-user";
import { listContacts, listNotifications } from "@/server/services/trusted-circle.service";
import { getSafetyPlan } from "@/server/services/safety.service";
import { PageHeader, Callout } from "@/components/ui/primitives";
import { TrustedCircle } from "@/components/trusted-circle/trusted-circle";
import { SafetyPlanEditor } from "@/components/trusted-circle/safety-plan-editor";
import { HeartHandshake } from "lucide-react";

export const metadata = { title: "Trusted Circle" };

export default async function CirclePage() {
  const actor = await requirePatientPage();
  const [contacts, notifications, plan] = await Promise.all([
    listContacts(actor.patientId),
    listNotifications(actor.patientId),
    getSafetyPlan(actor.patientId),
  ]);
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Trusted circle"
        title="The people in your corner"
        description="Add people you trust and decide exactly what they may be told. Nothing is ever shared without you choosing to send it."
      />
      <Callout tone="neutral" icon={<HeartHandshake />}>
        Involving family isn't right for everyone — and that's okay. You never have to add anyone, and you can remove a person or change what they can receive at any time.
      </Callout>
      <TrustedCircle
        contacts={contacts.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() }))}
        notifications={notifications.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() }))}
      />
      <section id="safety-plan" aria-labelledby="sp-title" className="scroll-mt-20">
        <h2 id="sp-title" className="font-display text-2xl text-ink">My safety plan</h2>
        <p className="mb-4 mt-1 max-w-2xl text-sm text-muted">
          A personal plan for difficult moments, based on widely used safety-planning steps. It's private and encrypted. You might like to make it with a clinician or someone you trust.
        </p>
        <SafetyPlanEditor initial={{ ...plan, updatedAt: plan.updatedAt?.toISOString() ?? null }} />
      </section>
    </div>
  );
}

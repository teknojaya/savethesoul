import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePatientPage } from "@/lib/auth/current-user";
import { listPatientSummaries, listShareableClinicians } from "@/server/services/summary.service";
import { PageHeader } from "@/components/ui/primitives";
import { ShareFlow } from "./share-flow";

export const metadata = { title: "Share with a clinician" };

export default async function SharePage() {
  const actor = await requirePatientPage();
  const [clinicians, summaries] = await Promise.all([listShareableClinicians(), listPatientSummaries(actor.patientId)]);
  return (
    <div>
      <Link href="/patient/support" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Find support
      </Link>
      <PageHeader
        eyebrow="Clinician summary"
        title="Share a summary — on your terms"
        description="Choose a clinician and exactly what to include. You'll see the full summary before anything is shared, and you can stop sharing at any time."
      />
      <ShareFlow
        clinicians={clinicians}
        summaries={summaries.map((s) => ({ ...s, sharedAt: s.sharedAt.toISOString(), revokedAt: s.revokedAt?.toISOString() ?? null, reviewedAt: s.reviewedAt?.toISOString() ?? null }))}
      />
    </div>
  );
}

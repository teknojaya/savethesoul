import Link from "next/link";
import { Lock, ChevronRight } from "lucide-react";
import { requireClinicianPage } from "@/lib/auth/current-user";
import { listAssignedPatients } from "@/server/services/clinician.service";
import { Badge, Card, PageHeader, EmptyState } from "@/components/ui/primitives";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Assigned patients" };

export default async function PatientsPage() {
  const actor = await requireClinicianPage();
  const patients = await listAssignedPatients(actor);
  return (
    <div>
      <PageHeader eyebrow="Assigned patients" title="Your patients" description="You only see patients assigned to you, and only the information each has chosen to share with you." />
      {patients.length === 0 ? (
        <EmptyState title="No assigned patients" description="Patients appear here after they request a referral or share a summary with you." />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {patients.map((p) => (
              <li key={p.patientId}>
                <Link href={`/clinician/patients/${p.patientId}`} className="flex flex-wrap items-center gap-3 px-5 py-4 hover:bg-sand/30" data-testid="patient-row">
                  <span className="flex size-10 items-center justify-center rounded-full bg-sky-50 font-semibold text-sky-700">{p.preferredName.slice(0, 1)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">{p.preferredName}</p>
                    <p className="text-xs text-muted">
                      {p.ageBand ?? "Age band not shared"} · {p.region} · assigned {formatDate(p.assignedAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {!p.hasConsent && <Badge tone="neutral"><Lock className="size-3" aria-hidden /> No active sharing consent</Badge>}
                    {p.latestWho5 !== null && <Badge tone={p.latestWho5 <= 50 ? "amber" : "sage"}>WHO-5 {p.latestWho5}</Badge>}
                    {p.trendDirection === "declining" && <Badge tone="amber">Declining</Badge>}
                    {p.openReferrals > 0 && <Badge tone="sky">{p.openReferrals} open referral{p.openReferrals > 1 ? "s" : ""}</Badge>}
                    {p.pendingAlerts > 0 && <Badge tone="safety">Simulated alert</Badge>}
                  </div>
                  <ChevronRight className="size-4 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

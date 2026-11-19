import Link from "next/link";
import { Siren } from "lucide-react";
import { requireHospitalPage } from "@/lib/auth/current-user";
import { listCases } from "@/server/services/emergency.service";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader, SimulatedBadge } from "@/components/ui/primitives";
import { EmergencyStatusBadge } from "@/components/hospital/status-badge";
import type { EmergencyStatus } from "@/features/emergency/state-machine";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Hospital emergency dashboard" };

const GROUPS: { label: string; statuses: EmergencyStatus[]; tone: string }[] = [
  { label: "Awaiting human review", statuses: ["DETECTED", "REVIEW_REQUESTED"], tone: "text-safety-700" },
  { label: "Acknowledged", statuses: ["ACKNOWLEDGED"], tone: "text-brand-700" },
  { label: "Contact attempts", statuses: ["CONTACT_ATTEMPTED", "UNABLE_TO_CONTACT"], tone: "text-brand-700" },
  { label: "Assistance arranged", statuses: ["ASSISTANCE_ARRANGED"], tone: "text-brand-700" },
  { label: "Resolved", statuses: ["RESOLVED"], tone: "text-sage-700" },
  { label: "Failed or cancelled", statuses: ["FAILED", "CANCELLED"], tone: "text-amber-700" },
];

export default async function HospitalDashboard() {
  const actor = await requireHospitalPage();
  const { organization, cases } = await listCases(actor);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Hospital emergency coordination · demo" title="Emergency dashboard" description={`${organization}. Cases appear here only when they are routed to this hospital.`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-testid="case-counters">
        {GROUPS.map((g) => (
          <Card key={g.label} className="p-4">
            <p className="text-xs font-medium text-muted">{g.label}</p>
            <p className={`mt-1 text-3xl font-bold tabular-nums ${g.tone}`}>{cases.filter((c) => g.statuses.includes(c.status)).length}</p>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Incoming and active cases <SimulatedBadge label="Simulated" />
          </CardTitle>
          <CardDescription>Only the minimum permitted context is shown. Conversations are never shared with the hospital.</CardDescription>
        </CardHeader>
        <CardContent>
          {cases.length === 0 ? (
            <EmptyState icon={<Siren />} title="No cases" description="No simulated cases have been routed to this hospital." />
          ) : (
            <ul className="divide-y divide-line" data-testid="case-list">
              {cases.map((c) => (
                <li key={c.id}>
                  <Link href={`/hospital/cases/${c.id}`} className="flex flex-wrap items-center gap-3 rounded-xl px-2 py-3 hover:bg-primary-subtle" data-testid="case-row">
                    <span className="font-mono text-sm font-semibold text-ink">{c.caseRef}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{c.concernType}</span>
                      <span className="block text-xs text-muted">
                        {c.patientLabel} · updated {formatDateTime(c.updatedAt)}
                        {c.assignedResponder ? ` · ${c.assignedResponder}` : ""}
                      </span>
                    </span>
                    <EmergencyStatusBadge status={c.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

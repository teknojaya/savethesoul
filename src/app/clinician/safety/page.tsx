import Link from "next/link";
import { requireClinicianPage } from "@/lib/auth/current-user";
import { listAlertsForClinician } from "@/server/services/safety.service";
import { listAuditForClinician } from "@/server/services/audit.service";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader, Callout } from "@/components/ui/primitives";
import { AcknowledgeButton } from "@/components/clinician/acknowledge-button";
import { formatDateTime } from "@/lib/utils";
import { Info } from "lucide-react";

export const metadata = { title: "Safety & audit" };

export default async function SafetyPage() {
  const actor = await requireClinicianPage();
  const [alerts, audit] = await Promise.all([listAlertsForClinician(actor), listAuditForClinician(actor.userId, 60)]);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Safety & audit" title="Safety alerts and access records" />
      <Callout tone="info" icon={<Info />}>
        Alerts appear only when a patient chooses to alert their care team. Acknowledge each alert promptly and follow your clinical escalation protocol.
      </Callout>

      <Card>
        <CardHeader>
          <CardTitle>Safety alerts</CardTitle>
          <CardDescription>Categories are produced by a rule-based language detector, not a clinical assessment. Message content is never shown.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {alerts.length === 0 && <EmptyState title="No alerts" />}
          {alerts.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3 text-sm" data-testid="alert-row">
              <div className="min-w-0 flex-1">
                <Link href={`/clinician/patients/${a.patient.id}`} className="font-semibold text-ink hover:underline">{a.patient.preferredName}</Link>
                <p className="text-xs text-muted">
                  {formatDateTime(a.simulatedAlertAt ?? a.createdAt)} · {a.level === "IMMEDIATE_DANGER" ? "Immediate danger pathway" : "Elevated concern pathway"} · source {a.source.toLowerCase().replace("_", " ")}
                </p>
              </div>
              {a.workflowStatus === "SIMULATED_ALERT_SENT" ? (
                <AcknowledgeButton id={a.id} />
              ) : (
                <Badge tone="sage">Acknowledged {a.acknowledgedAt && formatDateTime(a.acknowledgedAt)}</Badge>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My access audit trail</CardTitle>
          <CardDescription>Every access to patient information you make is recorded, including denied attempts. Patients can see access to their own data.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="py-2 text-start font-medium">Time</th>
                  <th className="py-2 text-start font-medium">Action</th>
                  <th className="py-2 text-start font-medium">Resource</th>
                  <th className="py-2 text-start font-medium">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id} className="border-b border-line/60">
                    <td className="py-2 pe-3 text-xs text-muted">{formatDateTime(a.createdAt)}</td>
                    <td className="py-2 pe-3">{a.action.replaceAll("_", " ").toLowerCase()}</td>
                    <td className="py-2 pe-3 text-muted">{a.resourceType}</td>
                    <td className="py-2"><Badge tone={a.outcome === "DENIED" ? "safety" : "sage"}>{a.outcome.toLowerCase()}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

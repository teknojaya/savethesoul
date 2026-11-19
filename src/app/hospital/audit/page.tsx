import { requireHospitalPage } from "@/lib/auth/current-user";
import { listCaseAudit } from "@/server/services/emergency.service";
import { Card, CardContent, PageHeader } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Audit records" };

export default async function HospitalAuditPage() {
  const actor = await requireHospitalPage();
  const rows = await listCaseAudit(actor);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Accountability" title="Audit records" description="Every view and action on emergency cases is recorded. Entries contain no clinical content." />
      <Card>
        <CardContent className="pt-5">
          <table className="w-full text-sm" data-testid="audit-table">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-2">Time</th>
                <th>Case</th>
                <th>Action</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 tabular-nums text-muted">{formatDateTime(r.createdAt)}</td>
                  <td className="font-mono">{r.caseRef}</td>
                  <td>{r.action.replace(/_/g, " ").toLowerCase()}</td>
                  <td className={r.outcome === "DENIED" ? "text-safety-700" : "text-sage-700"}>{r.outcome.toLowerCase()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

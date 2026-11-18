import { requireClinicianPage } from "@/lib/auth/current-user";
import { listFollowUps } from "@/server/services/clinician.service";
import { PageHeader, Stat, EmptyState } from "@/components/ui/primitives";
import { FollowUpRow } from "@/components/clinician/follow-up-row";

export const metadata = { title: "Follow-ups" };

export default async function FollowUpsPage() {
  const actor = await requireClinicianPage();
  const items = await listFollowUps(actor);
  const closed = items.filter((f) => f.status !== "PLANNED");
  const completed = items.filter((f) => f.status === "COMPLETED");
  const changes = completed.map((f) => f.functioningChange).filter((x): x is number => x !== null);
  const rate = closed.length ? Math.round((completed.length / closed.length) * 100) : null;
  const avg = changes.length ? (changes.reduce((s, x) => s + x, 0) / changes.length).toFixed(1) : null;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Follow-ups" title="Follow-up tracking" description="Record whether each follow-up happened and the patient-reported change in daily functioning." />
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Planned" value={items.filter((f) => f.status === "PLANNED").length} />
        <Stat label="Completed" value={completed.length} />
        <Stat label="Completion rate" value={rate === null ? "—" : `${rate}%`} hint="Completed ÷ (completed + missed + cancelled)" />
        <Stat label="Avg functioning change" value={avg === null ? "—" : avg} hint="Patient-reported, −2 to +2" />
      </div>
      {items.length === 0 ? (
        <EmptyState title="No follow-ups yet" description="Scheduling a referral creates a follow-up here." />
      ) : (
        <div className="space-y-2">
          {items.map((f) => (
            <FollowUpRow
              key={f.id}
              f={{ id: f.id, patientId: f.patient.id, patientName: f.patient.preferredName, scheduledFor: f.scheduledFor.toISOString(), status: f.status, functioningChange: f.functioningChange }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

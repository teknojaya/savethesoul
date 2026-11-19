import { requireClinicianPage } from "@/lib/auth/current-user";
import { listClinicianReferrals } from "@/server/services/referral.service";
import { PageHeader, EmptyState } from "@/components/ui/primitives";
import { ClinicianReferralCard } from "@/components/clinician/referral-actions";
import { TERMINAL } from "@/features/referrals/state-machine";

export const metadata = { title: "Referrals" };

export default async function ReferralsPage() {
  const actor = await requireClinicianPage();
  const referrals = await listClinicianReferrals(actor);
  const open = referrals.filter((r) => !TERMINAL.has(r.status));
  const closed = referrals.filter((r) => TERMINAL.has(r.status));
  const map = (r: (typeof referrals)[number]) => ({
    id: r.id,
    status: r.status,
    urgency: r.urgency,
    reason: r.reason,
    requestedAt: r.requestedAt.toISOString(),
    patientName: r.patient.preferredName,
    patientId: r.patient.id,
    hasSharingConsent: r.hasSharingConsent,
    events: r.events.map((e) => ({ id: e.id, toStatus: e.toStatus, actorRole: e.actorRole, note: e.note, createdAt: e.createdAt.toISOString() })),
  });
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Referrals"
        title="Referral requests"
        description="REQUESTED → ACKNOWLEDGED → SCHEDULED → COMPLETED. Every change is recorded."
      />
      <section className="space-y-3">
        <h2 className="font-display text-xl text-ink">Open ({open.length})</h2>
        {open.length === 0 ? <EmptyState title="No open referrals" /> : open.map((r) => <ClinicianReferralCard key={r.id} referral={map(r)} showPatient />)}
      </section>
      {closed.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-xl text-ink">Closed ({closed.length})</h2>
          {closed.map((r) => <ClinicianReferralCard key={r.id} referral={map(r)} showPatient />)}
        </section>
      )}
    </div>
  );
}

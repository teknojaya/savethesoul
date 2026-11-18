import Link from "next/link";
import { BellRing, CalendarCheck, Users, GitPullRequestArrow, ArrowRight } from "lucide-react";
import { requireClinicianPage } from "@/lib/auth/current-user";
import { clinicianOverview, listAssignedPatients } from "@/server/services/clinician.service";
import { Badge, Card, CardContent, CardHeader, CardTitle, PageHeader, Stat, Callout } from "@/components/ui/primitives";
import { STATUS_LABEL, type ReferralStatus } from "@/features/referrals/state-machine";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Clinician overview" };

export default async function ClinicianOverview() {
  const actor = await requireClinicianPage();
  const [o, patients] = await Promise.all([clinicianOverview(actor), listAssignedPatients(actor)]);
  const attention = patients.filter((p) => p.pendingAlerts > 0 || p.trendDirection === "declining" || (p.latestWho5 !== null && p.latestWho5 <= 50));

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Overview" title={`Welcome, ${actor.displayName}`} description="Consented patient information, referrals and follow-ups in one place." />

      {o.pendingAlerts > 0 && (
        <Callout tone="safety" icon={<BellRing />}>
          <strong>{o.pendingAlerts} simulated safety alert{o.pendingAlerts > 1 ? "s" : ""}</strong> awaiting acknowledgement.{" "}
          <Link href="/clinician/safety" className="font-semibold underline">Review now</Link>
        </Callout>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Assigned patients" value={o.patients} />
        <Stat label="New referrals" value={o.referralsByStatus.REQUESTED ?? 0} hint="Awaiting acknowledgement" />
        <Stat label="Scheduled" value={o.referralsByStatus.SCHEDULED ?? 0} />
        <Stat label="Completed" value={o.referralsByStatus.COMPLETED ?? 0} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Users className="size-4 text-sky-700" aria-hidden /> May need attention</CardTitle>
            <Link href="/clinician/patients" className="text-sm font-medium text-sky-700 hover:underline">All patients</Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {attention.length === 0 && <p className="text-sm text-muted">No flagged patients.</p>}
            {attention.map((p) => (
              <Link key={p.patientId} href={`/clinician/patients/${p.patientId}`} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2.5 text-sm hover:bg-sand/40">
                <span className="font-medium text-ink">{p.preferredName}</span>
                <span className="flex flex-wrap gap-1.5">
                  {p.pendingAlerts > 0 && <Badge tone="safety">Simulated alert</Badge>}
                  {p.latestWho5 !== null && <Badge tone={p.latestWho5 <= 50 ? "amber" : "neutral"}>WHO-5 {p.latestWho5}</Badge>}
                  {p.trendDirection === "declining" && <Badge tone="amber">Declining</Badge>}
                </span>
              </Link>
            ))}
            <p className="pt-1 text-xs text-muted">Flags reflect self-reported structured data only — not a risk assessment.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><CalendarCheck className="size-4 text-sky-700" aria-hidden /> Upcoming follow-ups</CardTitle>
            <Link href="/clinician/follow-ups" className="text-sm font-medium text-sky-700 hover:underline">Manage</Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {o.upcoming.length === 0 && <p className="text-sm text-muted">Nothing scheduled.</p>}
            {o.upcoming.map((f) => (
              <div key={f.id} className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5 text-sm">
                <span className="font-medium">{f.patient.preferredName}</span>
                <span className="text-muted">{formatDateTime(f.scheduledFor)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><GitPullRequestArrow className="size-4 text-sky-700" aria-hidden /> Referral pipeline</CardTitle>
          <Link href="/clinician/referrals" className="inline-flex items-center gap-1 text-sm font-medium text-sky-700 hover:underline">Open <ArrowRight className="size-3.5" aria-hidden /></Link>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {(Object.keys(STATUS_LABEL) as ReferralStatus[]).map((s) => (
              <div key={s} className="rounded-xl bg-sand/40 p-3">
                <p className="text-xs text-muted">{STATUS_LABEL[s]}</p>
                <p className="font-display text-xl tabular-nums">{o.referralsByStatus[s] ?? 0}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

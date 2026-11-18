import { requireClinicianPage } from "@/lib/auth/current-user";
import { getOutcomeMetrics, MIN_CELL_SIZE } from "@/server/services/analytics.service";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader, Stat, SimulatedBadge } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export const metadata = { title: "Outcomes & safety monitoring" };

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

export default async function OutcomesPage() {
  const actor = await requireClinicianPage();
  const m = await getOutcomeMetrics(actor);
  const maxWho5 = 100;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Outcomes & safety monitoring"
        title="Is the service helping, safely and fairly?"
        description={`Aggregate, de-identified metrics. Wellbeing figures include only the ${m.cohortSize} patients who opted in to anonymous statistics; groups smaller than ${MIN_CELL_SIZE} are suppressed. All data in this prototype is synthetic.`}
      />

      <section className="space-y-3">
        <h2 className="font-display text-xl text-ink">Engagement & wellbeing</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Check-ins (90 days)" value={m.checkInsLast90Days} />
          <Stat label="WHO-5 assessments (90 days)" value={m.assessmentsLast90Days} />
          <Stat label="Referral requests" value={m.referrals.requested} />
          <Stat label="Confirmed hand-offs" value={m.referrals.confirmedHandoffs} hint="Acknowledged, scheduled or completed" />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Average WHO-5 by month (opt-in cohort)</CardTitle>
            <CardDescription>Bars show the monthly mean percentage score; months with fewer than {MIN_CELL_SIZE} results are suppressed.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2" aria-label="Average WHO-5 by month">
              {m.who5Monthly.map((row) => (
                <li key={row.month} className="grid grid-cols-[5rem_1fr_4.5rem] items-center gap-3 text-sm">
                  <span className="text-muted tabular-nums">{row.month}</span>
                  <span className="h-3 overflow-hidden rounded-full bg-sand/60">
                    {row.average !== null && <span className="block h-full rounded-e-[4px] bg-[#00897b]" style={{ width: `${(row.average / maxWho5) * 100}%` }} />}
                  </span>
                  <span className="text-end tabular-nums text-ink">{row.average === null ? `n<${MIN_CELL_SIZE}` : row.average}<span className="text-xs text-muted"> · n={row.n}</span></span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl text-ink">Professional follow-up</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Median time to first contact" value={m.referrals.medianHoursToFirstContact === null ? "—" : `${m.referrals.medianHoursToFirstContact.toFixed(1)} h`} hint="Request → acknowledgement" />
          <Stat label="Follow-ups completed" value={`${m.followUps.completed}/${m.followUps.total}`} />
          <Stat label="Follow-up completion rate" value={pct(m.followUps.completionRate)} hint="Of follow-ups that have closed" />
          <Stat label="Avg functioning change" value={m.followUps.averageFunctioningChange ?? "—"} hint="Patient-reported, −2 to +2" />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl text-ink">Safety workflow & system health</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Immediate-danger pathways" value={m.safety.immediateDangerPathways} />
          <Stat label="Elevated-concern pathways" value={m.safety.elevatedConcernPathways} />
          <Stat label="Simulated alerts acknowledged" value={`${m.safety.simulatedAlertsAcknowledged}/${m.safety.simulatedAlertsSent}`} />
          <Stat label="Failed hand-offs" value={m.safety.handoffFailures} hint="e.g. no care team connected" />
          <Stat label="Help page opens" value={m.safety.helpPageOpens} />
          <Stat label="Emergency call taps" value={m.safety.emergencyCallTaps} />
          <Stat label="AI errors / timeouts" value={m.system.llmErrors} hint="Safe fallback shown each time" />
          <Stat label="Output-guard interventions" value={m.system.outputGuardInterventions} />
        </div>
        <p className="text-xs text-muted">A pathway count is not a count of people at risk — the detector is deliberately sensitive and also misses things. A missing flag is never evidence of safety.</p>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-xl text-ink">Fairness monitoring framework</h2>
          <SimulatedBadge label="Synthetic data" />
        </div>
        <p className="max-w-3xl text-sm text-muted">
          Outcomes are compared across coarse, optional groups. Cells below {MIN_CELL_SIZE} are suppressed; differences of more than 10 percentage points from the overall rate are highlighted for review. No unnecessary demographic data is collected.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          {m.fairness.dimensions.map((dim) => (
            <Card key={dim.dimension}>
              <CardHeader><CardTitle>{dim.dimension}</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-xs text-muted">
                      <th className="py-2 text-start font-medium">Group</th>
                      <th className="py-2 text-end font-medium">n</th>
                      <th className="py-2 text-end font-medium">Referral completion</th>
                      <th className="py-2 text-end font-medium">Crisis workflow</th>
                      <th className="py-2 text-end font-medium">Follow-up</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dim.groups.map((g) => {
                      const flag = (v: number | null, overall: number) => v !== null && Math.abs(v - overall) > 0.1;
                      const cell = (v: number | null, overall: number) => (
                        <td className={cn("py-2 text-end tabular-nums", flag(v, overall) && "font-semibold text-amber-700")}>
                          {v === null ? <span className="text-xs text-muted">suppressed</span> : pct(v)}
                          {flag(v, overall) && <span className="sr-only"> (more than 10 points from overall)</span>}
                        </td>
                      );
                      return (
                        <tr key={g.group} className="border-b border-line/60">
                          <td className="py-2">{g.group}</td>
                          <td className="py-2 text-end tabular-nums text-muted">{g.n}</td>
                          {cell(g.referralCompletion, m.fairness.overall.referralCompletion)}
                          {cell(g.crisisWorkflowCompletion, m.fairness.overall.crisisWorkflowCompletion)}
                          {cell(g.followUpCompletion, m.fairness.overall.followUpCompletion)}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="text-xs text-muted">
          Overall: referral completion {pct(m.fairness.overall.referralCompletion)} · crisis workflow {pct(m.fairness.overall.crisisWorkflowCompletion)} · follow-up {pct(m.fairness.overall.followUpCompletion)}. Bold amber = differs by more than 10 points.
        </p>
      </section>
    </div>
  );
}

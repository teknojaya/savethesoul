import Link from "next/link";
import { ArrowLeft, Lock, MessagesSquare, ShieldAlert } from "lucide-react";
import { requireClinicianPage } from "@/lib/auth/current-user";
import { getPatientDetail } from "@/server/services/clinician.service";
import { AppError } from "@/lib/errors";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Who5TrendChart, CheckInChart } from "@/components/wellbeing/charts";
import { SummaryView } from "@/components/clinician/summary-view";
import { AiDraftCard, FindingsPanel, NotesPanel } from "@/components/clinician/patient-actions";
import { listFindings } from "@/server/services/findings.service";
import { ClinicianReferralCard } from "@/components/clinician/referral-actions";
import { CLINICIAN_SHARE_CATEGORIES, type ClinicianShareCategory } from "@/features/consent/policy";
import type { ReferralStatus } from "@/features/referrals/state-machine";
import { formatDate, formatDateTime } from "@/lib/utils";
import { getSharedInsightForClinician } from "@/server/services/clinical-intelligence.service";
import { ClinicianGoalForm, ClinicianInsightsPanel, type SharedInsight } from "@/components/clinician/insights-panel";
import { prisma } from "@/lib/db/prisma";

export const metadata = { title: "Patient details" };

export default async function PatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireClinicianPage();
  const { id } = await params;
  let d: Awaited<ReturnType<typeof getPatientDetail>>;
  try {
    d = await getPatientDetail(actor, id);
  } catch (e) {
    if (e instanceof AppError && (e.code === "FORBIDDEN" || e.code === "NOT_FOUND")) {
      return (
        <div>
          <Link href="/clinician/patients" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
            <ArrowLeft className="size-4" aria-hidden /> Patients
          </Link>
          <EmptyState
            icon={<Lock />}
            title="You don't have access to this patient's information"
            description="Access requires an active care assignment and the patient's current sharing consent. This attempt has been recorded in the audit log."
          />
        </div>
      );
    }
    throw e;
  }

  const has = (c: ClinicianShareCategory) => d.sharedCategories.includes(c);
  const findings = await listFindings(actor, id);
  const insight = await getSharedInsightForClinician(actor, id).catch(() => null);
  const clinicianGoals = await prisma.wellbeingGoal.findMany({ where: { patientId: id, source: "CLINICIAN" }, orderBy: { createdAt: "desc" }, take: 10 });

  return (
    <div className="space-y-6">
      <Link href="/clinician/patients" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Patients
      </Link>
      <PageHeader
        eyebrow="Patient details"
        title={d.patient.preferredName}
        description={`${d.patient.ageBand ?? "Age band not provided"} · ${d.patient.region}`}
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 pt-5 sm:pt-6">
          <span className="text-sm text-muted">Shared with you:</span>
          {d.sharedCategories.map((c) => (
            <Badge key={c} tone="brand">{CLINICIAN_SHARE_CATEGORIES[c as ClinicianShareCategory] ?? c}</Badge>
          ))}
          {!d.conversations && <Badge tone="outline"><Lock className="size-3" aria-hidden /> Conversations not shared</Badge>}
        </CardContent>
      </Card>

      {d.alerts.length > 0 && (
        <Card className="border-safety-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-safety-700"><ShieldAlert className="size-4" aria-hidden /> Safety alerts</CardTitle>
            <CardDescription>Patient-initiated alerts. Categories come from a rule-based detector and are not a clinical risk assessment.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {d.alerts.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm">
                <span>{formatDateTime(a.createdAt)} · {a.level === "IMMEDIATE_DANGER" ? "Immediate danger pathway" : "Elevated concern pathway"}</span>
                <span className="flex items-center gap-1.5">
                  <Badge tone={a.workflowStatus === "SIMULATED_ACKNOWLEDGED" ? "sage" : "safety"}>{a.workflowStatus === "SIMULATED_ACKNOWLEDGED" ? "Acknowledged" : "Awaiting acknowledgement"}</Badge>
                </span>
              </div>
            ))}
            <Link href="/clinician/safety" className="text-sm font-medium text-sky-700 hover:underline">Open safety queue</Link>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>WHO-5 history</CardTitle>
            <CardDescription>Patient self-report. Not diagnostic; does not assess suicide risk.</CardDescription>
          </CardHeader>
          <CardContent>
            {has("WHO5_HISTORY") && d.assessments ? (
              d.assessments.length ? (
                <>
                  <Who5TrendChart data={d.assessments.map((a) => ({ date: a.completedAt.toISOString(), percentScore: a.percentScore }))} height={200} />
                  <ul className="mt-3 space-y-1 text-xs text-muted">
                    {d.who5Trend?.explanations.map((e) => <li key={e}>• {e}</li>)}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-muted">No assessments yet.</p>
              )
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted"><Lock className="size-4" aria-hidden /> Not shared by the patient.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Mood & functioning trends</CardTitle>
            <CardDescription>Self-reported daily check-ins (1–5), last 60 days.</CardDescription>
          </CardHeader>
          <CardContent>
            {d.checkIns ? (
              <>
                <CheckInChart height={200} data={d.checkIns.map((c) => ({ createdAt: c.createdAt.toISOString(), mood: c.mood, sleepQuality: c.sleepQuality, stress: c.stress }))} />
                {has("FUNCTIONING") && d.checkInSummary && (
                  <p className="mt-2 text-sm text-ink-soft">
                    Functioning: last 7 days {d.checkInSummary.functioning.recent ?? "—"} vs prior week {d.checkInSummary.functioning.prior ?? "—"}
                  </p>
                )}
              </>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted"><Lock className="size-4" aria-hidden /> Not shared by the patient.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {d.patient.physicalHealthContext && (
        <Card>
          <CardHeader><CardTitle>Physical health context (patient-supplied)</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-ink-soft">{d.patient.physicalHealthContext}</p></CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-xl text-ink">Shared summaries</h2>
        {d.summaries.length === 0 && <p className="text-sm text-muted">No active summaries.</p>}
        {d.summaries.map((s) => (
          <div key={s.id} className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>A · Patient-reported information</CardTitle>
                <CardDescription>Patient-approved summary · shared {formatDate(s.sharedAt)} · built from structured data, not AI</CardDescription>
              </CardHeader>
              <CardContent><SummaryView content={s.content} /></CardContent>
            </Card>
            <AiDraftCard
              summaryId={s.id}
              draft={s.aiDraft}
              status={s.aiDraftStatus}
              reviewedAt={s.reviewedAt?.toISOString() ?? null}
              correctedDraft={s.correctedDraft}
              reviewNote={s.reviewNote}
            />
          </div>
        ))}
      </section>

      {insight && (
        <section className="space-y-3">
          <h2 className="font-display text-xl text-ink">Clinical Intelligence (shared by the patient)</h2>
          <ClinicianInsightsPanel insight={JSON.parse(JSON.stringify(insight)) as SharedInsight} />
        </section>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="font-display text-xl text-ink">C · Clinician-confirmed findings</h2>
          <p className="text-sm text-muted">Diagnoses and care plans are recorded only by clinicians, separately from patient reports and AI observations. Entries are never edited: add a new one to update.</p>
        </div>
        <FindingsPanel patientId={id} findings={findings.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() }))} />
        <ClinicianGoalForm patientId={id} goals={clinicianGoals.map((g) => ({ id: g.id, title: g.title, status: g.status, authorName: g.authorName }))} />
      </section>
      {d.conversations && (
        <section className="space-y-3" data-testid="shared-conversations">
          <div>
            <h2 className="flex items-center gap-2 font-display text-xl text-ink"><MessagesSquare className="size-5 text-brand-600" aria-hidden /> Conversations with Sakinah</h2>
            <p className="text-sm text-muted">Shared by the patient with you, read-only. The patient can stop sharing at any time; every view is recorded in the audit log.</p>
          </div>
          {d.conversations.length === 0 && <p className="text-sm text-muted">No saved conversations yet.</p>}
          {d.conversations.map((c, i) => (
            <details key={c.id} open={i === 0} className="rounded-2xl border border-line bg-surface p-4 shadow-soft" data-testid="shared-conversation">
              <summary className="cursor-pointer text-sm font-semibold text-ink">
                {c.title} <span className="font-normal text-muted">· {c.messages.length} messages · last {formatDateTime(c.updatedAt)}</span>
              </summary>
              <ol className="mt-3 space-y-2">
                {c.messages.map((m) => (
                  <li key={m.id} className={m.role === "USER" ? "ms-auto max-w-[85%] rounded-2xl bg-brand-600 px-3 py-2 text-sm text-white" : m.role === "SAFETY" ? "max-w-[85%] rounded-2xl border border-safety-100 bg-safety-50 px-3 py-2 text-sm text-safety-700" : "max-w-[85%] rounded-2xl bg-primary-subtle px-3 py-2 text-sm text-ink-soft"}>
                    <p className="mb-0.5 text-[11px] font-semibold opacity-80">{m.role === "USER" ? d.patient.preferredName : m.role === "SAFETY" ? "Safety response" : "Sakinah (AI)"} · {formatDateTime(m.createdAt)}</p>
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </li>
                ))}
              </ol>
            </details>
          ))}
        </section>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3">
          <h2 className="font-display text-xl text-ink">Referrals & follow-up</h2>
          {d.referrals.length === 0 && <p className="text-sm text-muted">No referrals assigned to you.</p>}
          {d.referrals.map((r) => (
            <ClinicianReferralCard
              key={r.id}
              referral={{
                id: r.id,
                status: r.status as ReferralStatus,
                urgency: r.urgency,
                reason: r.reason,
                requestedAt: r.requestedAt.toISOString(),
                patientName: d.patient.preferredName,
                patientId: d.patient.id,
                events: r.events.map((e) => ({ id: e.id, toStatus: e.toStatus, actorRole: e.actorRole, note: e.note, createdAt: e.createdAt.toISOString() })),
              }}
            />
          ))}
          {d.followUps.length > 0 && (
            <Card className="p-4 text-sm">
              <p className="font-medium text-ink">Follow-ups</p>
              <ul className="mt-2 space-y-1 text-ink-soft">
                {d.followUps.map((f) => (
                  <li key={f.id}>{formatDateTime(f.scheduledFor)} · {f.status.toLowerCase()}{f.functioningChange !== null ? ` · functioning change ${f.functioningChange > 0 ? "+" : ""}${f.functioningChange}` : ""}</li>
                ))}
              </ul>
            </Card>
          )}
        </section>
        <section>
          <h2 className="mb-3 font-display text-xl text-ink">Clinician notes</h2>
          <NotesPanel patientId={d.patient.id} notes={d.notes.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() }))} />
        </section>
      </div>
    </div>
  );
}

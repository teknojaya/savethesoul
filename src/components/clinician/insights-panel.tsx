"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Brain, Loader2, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Textarea } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/api-client";
import { CATEGORY_LABEL, INSIGHT_LABEL, ITEM_SECTIONS, type Category } from "@/features/clinical-intelligence/labels";
import type { InsightContent } from "@/features/clinical-intelligence/engine";
import { formatDate, formatDateTime } from "@/lib/utils";

const CLINICIAN_SECTION: Record<(typeof ITEM_SECTIONS)[number], string> = {
  presentingConcerns: "Presenting concerns (patient-reported)",
  reportedSymptoms: "Reported symptoms (patient-reported)",
  durationAndFrequency: "Duration and frequency (patient-reported)",
  functioningImpact: "Functional impact (patient-reported)",
  contextAndCoping: "Context and coping (patient-reported)",
  reportedChanges: "Reported changes (patient-reported)",
};
const DECISION: Record<string, { tone: "amber" | "sage" | "brand" | "safety"; label: string }> = {
  UNREVIEWED: { tone: "amber", label: "Needs review" },
  APPROVED: { tone: "sage", label: "Approved as reviewed (not a diagnosis)" },
  CORRECTED: { tone: "brand", label: "Corrected by clinician" },
  REJECTED: { tone: "safety", label: "Rejected by clinician" },
};

export interface SharedInsight {
  latest: {
    id: string;
    createdAt: string;
    approvedAt: string | null;
    patientNote: string | null;
    clinicianStatus: string;
    clinicianNote: string | null;
    reviewedAt: string | null;
    content: InsightContent;
  } | null;
  previousApprovedAt: string | null;
  changes: { newAreas: Category[]; noLongerMentioned: Category[]; continuing: Category[] } | null;
}

export function ClinicianInsightsPanel({ insight }: { insight: SharedInsight }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const l = insight.latest;
  if (!l) {
    return (
      <Card data-testid="clinician-insights">
        <CardContent className="pt-5 text-sm text-muted">The patient shared Clinical Insights with you, but has not approved an insight report yet.</CardContent>
      </Card>
    );
  }
  const badge = DECISION[l.clinicianStatus] ?? DECISION.UNREVIEWED;
  async function decide(decision: "APPROVED" | "CORRECTED" | "REJECTED") {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/clinician/insights/${l!.id}/review`, { body: { decision, note: note.trim() || null } });
      setNote("");
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save the review");
    } finally {
      setBusy(false);
    }
  }
  const cats = (c: Category[]) => c.map((x) => CATEGORY_LABEL[x]).join(", ");
  return (
    <Card data-testid="clinician-insights">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2"><Brain className="size-4 text-brand-600" aria-hidden /> Sakinah Clinical Intelligence report</CardTitle>
          <Badge tone={badge.tone} data-testid="clinician-insight-status">{badge.label}</Badge>
        </div>
        <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700">{INSIGHT_LABEL}</p>
        <CardDescription>
          Organised by AI from the patient&apos;s own messages (each item cites the patient&apos;s exact words) and reviewed and approved by the patient on{" "}
          {l.approvedAt ? formatDate(l.approvedAt) : "—"}. Analysed {formatDateTime(l.createdAt)}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {insight.changes && insight.previousApprovedAt && (
          <div className="rounded-xl border border-brand-100 bg-brand-50 p-3 text-brand-900" data-testid="clinician-insight-changes">
            <p className="font-semibold">E · Changes since the report approved {formatDate(insight.previousApprovedAt)}</p>
            {insight.changes.newAreas.length > 0 && <p>New: {cats(insight.changes.newAreas)}</p>}
            {insight.changes.continuing.length > 0 && <p>Continuing: {cats(insight.changes.continuing)}</p>}
            {insight.changes.noLongerMentioned.length > 0 && <p>No longer mentioned: {cats(insight.changes.noLongerMentioned)}</p>}
          </div>
        )}
        {ITEM_SECTIONS.map((k) =>
          l.content.sections[k].length ? (
            <section key={k}>
              <h4 className="font-semibold text-ink">{CLINICIAN_SECTION[k]}</h4>
              <ul className="mt-1 space-y-1">
                {l.content.sections[k].map((i) => (
                  <li key={i.id} className="rounded-lg bg-sand/40 px-2.5 py-1.5">
                    {i.text}
                    <span className="block text-xs text-muted">“{i.quote}” · {formatDate(i.source.date)} · {CATEGORY_LABEL[i.category]}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null,
        )}
        {l.content.possibleConsiderations.length > 0 && (
          <section>
            <h4 className="font-semibold text-ink">C · AI preliminary considerations (unconfirmed)</h4>
            <ul className="mt-1 list-disc ps-5 text-ink-soft">{l.content.possibleConsiderations.map((c) => <li key={c.id}>{c.text} <span className="text-xs text-muted">(basis: {c.basedOn.join(", ")})</span></li>)}</ul>
          </section>
        )}
        {l.content.missingInformation.length > 0 && (
          <section>
            <h4 className="font-semibold text-ink">Information still needed</h4>
            <ul className="mt-1 list-disc ps-5 text-ink-soft">{l.content.missingInformation.map((t) => <li key={t}>{t}</li>)}</ul>
          </section>
        )}
        {l.content.reviewQuestions.length > 0 && (
          <section>
            <h4 className="font-semibold text-ink">Questions for professional review</h4>
            <ul className="mt-1 list-disc ps-5 text-ink-soft">{l.content.reviewQuestions.map((t) => <li key={t}>{t}</li>)}</ul>
          </section>
        )}
        {l.patientNote && <p className="rounded-xl border border-line px-3 py-2"><span className="font-medium text-ink">Patient&apos;s correction: </span>{l.patientNote}</p>}
        {l.clinicianNote && <p className="rounded-xl border border-line px-3 py-2" data-testid="clinician-insight-note"><span className="font-medium text-ink">Your review note: </span>{l.clinicianNote}</p>}
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Review note or correction (required to correct)" aria-label="Review note" data-testid="clinician-insight-note-input" />
        {error && <p role="alert" className="text-sm text-safety-700">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => decide("APPROVED")} data-testid="clinician-insight-approve">
            {busy && <Loader2 className="animate-spin" aria-hidden />} Approve as reviewed
          </Button>
          <Button size="sm" variant="secondary" disabled={busy || !note.trim()} onClick={() => decide("CORRECTED")} data-testid="clinician-insight-correct">
            Save correction
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide("REJECTED")} data-testid="clinician-insight-reject">
            Reject
          </Button>
        </div>
        <p className="text-xs text-muted">Approving records your review only. Record any diagnosis separately under clinician-confirmed findings after your own evaluation.</p>
      </CardContent>
    </Card>
  );
}

/** Patient-facing follow-up goals (visible to the patient; Sakinah may use them only with the patient's permission). */
export function ClinicianGoalForm({ patientId, goals }: { patientId: string; goals: { id: string; title: string; status: string; authorName: string | null }[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card data-testid="clinician-goals">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Target className="size-4 text-brand-600" aria-hidden /> Follow-up goals for the patient</CardTitle>
        <CardDescription>Shown to the patient. With their permission, Sakinah may gently check in on these goals between consultations. Your private notes are never shared.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {goals.length > 0 && (
          <ul className="space-y-1">
            {goals.map((g) => (
              <li key={g.id} className="rounded-lg bg-sand/40 px-2.5 py-1.5" data-testid="clinician-goal">
                {g.title} <span className="text-xs text-muted">· {g.status.toLowerCase()}{g.authorName ? ` · ${g.authorName}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Input value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Keep a regular evening wind-down routine" aria-label="New follow-up goal" data-testid="clinician-goal-input" />
          <Button
            size="sm"
            disabled={busy || title.trim().length < 3}
            data-testid="clinician-goal-add"
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await api(`/api/clinician/patients/${patientId}/goals`, { body: { title } });
                setTitle("");
                router.refresh();
              } catch (e) {
                setError(e instanceof ApiError ? e.message : "Could not add the goal");
              } finally {
                setBusy(false);
              }
            }}
          >
            Add goal
          </Button>
        </div>
        {error && <p role="alert" className="text-sm text-safety-700">{error}</p>}
      </CardContent>
    </Card>
  );
}

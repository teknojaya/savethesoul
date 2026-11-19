"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Textarea } from "@/components/ui/primitives";
import { api } from "@/lib/api-client";
import { formatDate, formatDateTime } from "@/lib/utils";

const DECISION_BADGE: Record<string, { tone: "sage" | "amber" | "brand" | "safety"; label: string }> = {
  UNVERIFIED: { tone: "amber", label: "Needs review" },
  REVIEWED: { tone: "sage", label: "Reviewed" },
  APPROVED: { tone: "sage", label: "Approved" },
  CORRECTED: { tone: "brand", label: "Corrected by clinician" },
  REJECTED: { tone: "safety", label: "Rejected by clinician" },
};

/**
 * The AI-generated clinical support summary and the clinician's decision on it. The original
 * draft is always kept; a correction is stored separately. Nothing here is a confirmed finding.
 */
export function AiDraftCard({
  summaryId,
  draft,
  status,
  reviewedAt,
  correctedDraft,
  reviewNote,
}: {
  summaryId: string;
  draft: string | null;
  status: string;
  reviewedAt: string | null;
  correctedDraft?: string | null;
  reviewNote?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(correctedDraft ?? draft ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const badge = DECISION_BADGE[status] ?? DECISION_BADGE.UNVERIFIED;

  async function regenerate() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/summaries/${summaryId}/regenerate`, { body: {} });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not regenerate the draft");
    } finally {
      setBusy(false);
    }
  }

  async function decide(decision: "APPROVED" | "CORRECTED" | "REJECTED") {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/summaries/${summaryId}/review`, { body: { decision, correctedText: decision === "CORRECTED" ? text : null, note: note.trim() || null } });
      setEditing(false);
      setNote("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the review");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={status === "UNVERIFIED" ? "border-amber-500/30" : ""} data-testid="ai-draft">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-amber-700" aria-hidden /> B · AI preliminary assessment</CardTitle>
          <Badge tone={badge.tone}>
            {status === "UNVERIFIED" ? <AlertTriangle className="size-3" aria-hidden /> : <CheckCircle2 className="size-3" aria-hidden />} {badge.label}
            {reviewedAt && status !== "UNVERIFIED" ? ` ${formatDate(reviewedAt)}` : ""}
          </Badge>
        </div>
        <CardDescription data-testid="ai-summary-label">AI draft from patient-approved data · review before clinical use</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!draft ? (
          <div className="space-y-2">
            <p className="text-sm text-muted">No AI draft is available (the AI service was unavailable). Use the structured summary.</p>
            {error && <p role="alert" className="text-sm text-safety-700">{error}</p>}
            <Button size="sm" variant="secondary" disabled={busy} onClick={regenerate} data-testid="draft-regenerate">
              {busy && <Loader2 className="animate-spin" aria-hidden />} Generate AI draft
            </Button>
          </div>
        ) : (
          <>
            {correctedDraft && (
              <div>
                <p className="mb-1 text-xs font-semibold text-brand-800">Clinician-corrected version</p>
                <pre className="whitespace-pre-wrap rounded-xl bg-brand-50/60 p-3 font-sans text-sm text-ink-soft" data-testid="corrected-draft">{correctedDraft}</pre>
              </div>
            )}
            <details open={!correctedDraft}>
              <summary className="cursor-pointer text-xs font-semibold text-muted">{correctedDraft ? "Original AI draft" : "AI draft"}</summary>
              <pre className="mt-1 whitespace-pre-wrap rounded-xl bg-sand/40 p-3 font-sans text-sm text-ink-soft">{draft}</pre>
            </details>
            {reviewNote && (
              <p className="rounded-xl border border-line px-3 py-2 text-sm text-ink-soft" data-testid="review-note">
                <span className="font-medium text-ink">Review note: </span>
                {reviewNote}
              </p>
            )}
            {editing ? (
              <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} aria-label="Corrected summary" data-testid="draft-correction" />
            ) : null}
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Review note (optional)" aria-label="Review note" data-testid="draft-note" />
            {error && <p role="alert" className="text-sm text-safety-700">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={() => decide("APPROVED")} data-testid="draft-approve">
                {busy && <Loader2 className="animate-spin" aria-hidden />} Approve
              </Button>
              {editing ? (
                <Button size="sm" variant="secondary" disabled={busy || !text.trim()} onClick={() => decide("CORRECTED")} data-testid="draft-save-correction">
                  Save correction
                </Button>
              ) : (
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => setEditing(true)} data-testid="draft-correct">
                  Correct
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide("REJECTED")} data-testid="draft-reject">
                Reject
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={regenerate} data-testid="draft-regenerate" title="Create a new, detailed draft from the same patient-approved data">
                Regenerate detailed draft
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Clinician-confirmed findings (diagnosis, care plan): authored by a clinician, never by AI. */
export function FindingsPanel({
  patientId,
  findings,
}: {
  patientId: string;
  findings: { id: string; kind: string; content: string; createdAt: string; author: string }[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState<"DIAGNOSIS" | "CARE_PLAN">("DIAGNOSIS");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card className="p-4" data-testid="findings-panel">
      <ul className="mb-3 space-y-2">
        {findings.length === 0 && <li className="text-sm text-muted">No clinician-confirmed findings yet.</li>}
        {findings.map((f) => (
          <li key={f.id} className="rounded-xl border border-line p-3 text-sm" data-testid="finding">
            <p className="text-xs font-semibold text-ink">
              {f.kind === "DIAGNOSIS" ? "Diagnosis" : "Care plan"} · {f.author} · {formatDateTime(f.createdAt)}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-ink-soft">{f.content}</p>
          </li>
        ))}
      </ul>
      <form
        className="space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          setBusy(true);
          setError(null);
          try {
            await api(`/api/clinician/patients/${patientId}/findings`, { body: { kind, content: text } });
            setText("");
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not save");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="flex gap-2">
          {(["DIAGNOSIS", "CARE_PLAN"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`rounded-full border px-3 py-1 text-xs ${kind === k ? "border-brand-500 bg-brand-50 text-brand-800" : "border-line text-ink-soft"}`}>
              {k === "DIAGNOSIS" ? "Diagnosis" : "Care plan"}
            </button>
          ))}
        </div>
        <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Recorded under your name, with a timestamp and an audit entry." aria-label="Clinician finding" data-testid="finding-text" />
        {error && <p role="alert" className="text-sm text-safety-700">{error}</p>}
        <div className="flex justify-end">
          <Button size="sm" type="submit" disabled={busy || !text.trim()} data-testid="finding-save">
            {busy && <Loader2 className="animate-spin" aria-hidden />} Record finding
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function NotesPanel({ patientId, notes }: { patientId: string; notes: { id: string; content: string; createdAt: string }[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Card className="p-4">
      <form
        className="space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          setBusy(true);
          await api(`/api/clinician/patients/${patientId}/notes`, { body: { content: text } }).catch(() => null);
          setText("");
          setBusy(false);
          router.refresh();
        }}
      >
        <label htmlFor="note" className="sr-only">Add a note</label>
        <Textarea id="note" rows={3} placeholder="Private clinician note (encrypted, not visible to the patient)" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex justify-end">
          <Button size="sm" type="submit" disabled={busy || !text.trim()}>{busy && <Loader2 className="animate-spin" aria-hidden />} Add note</Button>
        </div>
      </form>
      <ul className="mt-3 space-y-2">
        {notes.map((n) => (
          <li key={n.id} className="rounded-xl bg-sand/40 p-3 text-sm">
            <p className="whitespace-pre-wrap text-ink-soft">{n.content}</p>
            <p className="mt-1 text-xs text-muted">{formatDateTime(n.createdAt)}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

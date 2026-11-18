"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Textarea } from "@/components/ui/primitives";
import { api } from "@/lib/api-client";
import { formatDate, formatDateTime } from "@/lib/utils";

export function AiDraftCard({ summaryId, draft, status, reviewedAt }: { summaryId: string; draft: string | null; status: string; reviewedAt: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const reviewed = status === "REVIEWED";
  return (
    <Card className={reviewed ? "" : "border-amber-500/30"} data-testid="ai-draft">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-amber-700" aria-hidden /> AI-generated draft</CardTitle>
          {reviewed ? (
            <Badge tone="sage"><CheckCircle2 className="size-3" aria-hidden /> Reviewed {reviewedAt && formatDate(reviewedAt)}</Badge>
          ) : (
            <Badge tone="amber"><AlertTriangle className="size-3" aria-hidden /> Unverified</Badge>
          )}
        </div>
        <CardDescription>Drafted by AI from the structured summary only. It may contain errors and is not a clinical determination.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {draft ? (
          <pre className="whitespace-pre-wrap rounded-xl bg-sand/40 p-3 font-sans text-sm text-ink-soft">{draft}</pre>
        ) : (
          <p className="text-sm text-muted">No AI draft is available (the AI service was unavailable). Use the structured summary.</p>
        )}
        {draft && !reviewed && (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            data-testid="mark-reviewed"
            onClick={async () => {
              setBusy(true);
              await api(`/api/summaries/${summaryId}/review`, { method: "POST" }).catch(() => null);
              setBusy(false);
              router.refresh();
            }}
          >
            {busy && <Loader2 className="animate-spin" aria-hidden />} I have reviewed this draft against the source data
          </Button>
        )}
      </CardContent>
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
        <Textarea id="note" rows={3} placeholder="Private clinician annotation (encrypted, not visible to the patient in the prototype)" value={text} onChange={(e) => setText(e.target.value)} />
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

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/api-client";
import { ACTION_LABEL, type EmergencyStatus } from "@/features/emergency/state-machine";

export function CaseActions({ caseId, next }: { caseId: string; next: EmergencyStatus[] }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<EmergencyStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!next.length) return <p className="text-sm text-muted">This case is closed. No further actions.</p>;
  return (
    <div className="space-y-3">
      <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Response note (optional, synthetic)" aria-label="Response note" data-testid="case-note" />
      {error && <p role="alert" className="text-sm text-safety-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {next.map((to) => (
          <Button
            key={to}
            size="sm"
            variant={to === "FAILED" || to === "CANCELLED" ? "ghost" : to === next[0] ? "primary" : "secondary"}
            disabled={!!busy}
            data-testid={`case-action-${to}`}
            onClick={async () => {
              setBusy(to);
              setError(null);
              try {
                await api(`/api/hospital/cases/${caseId}/transition`, { body: { to, note: note.trim() || null } });
                setNote("");
                router.refresh();
              } catch (e) {
                setError(e instanceof ApiError ? e.message : "Could not update the case");
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === to && <Loader2 className="animate-spin" aria-hidden />} {ACTION_LABEL[to] ?? to}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function FamilyPanel({
  caseId,
  contacts,
  canNotify,
}: {
  caseId: string;
  contacts: { id: string; name: string; relationship: string; allowed: boolean; reason: string | null }[];
  canNotify: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  if (!contacts.length) return <p className="text-sm text-muted">The patient has no trusted contacts. Family notification is not appropriate or possible.</p>;
  return (
    <div className="space-y-2" data-testid="family-panel">
      {contacts.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm">
          <span>
            <span className="font-medium text-ink">{c.name}</span> <span className="text-muted">· {c.relationship}</span>
            {!c.allowed && <span className="block text-xs text-amber-700">{c.reason}</span>}
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={!c.allowed || !canNotify || !!busy}
            data-testid="family-notify"
            onClick={async () => {
              setBusy(c.id);
              try {
                await api(`/api/hospital/cases/${caseId}/family-notification`, { body: { contactId: c.id } });
                setMessage(`Simulated safety-plan message recorded for ${c.name}. Nothing was sent.`);
                router.refresh();
              } catch (e) {
                setMessage(e instanceof ApiError ? e.message : "Not recorded");
              } finally {
                setBusy(null);
              }
            }}
          >
            Record simulated notification
          </Button>
        </div>
      ))}
      {!canNotify && <p className="text-xs text-muted">Acknowledge the case first.</p>}
      {message && <p className="text-xs text-ink-soft">{message}</p>}
    </div>
  );
}

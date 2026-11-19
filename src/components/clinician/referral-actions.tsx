"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, Input } from "@/components/ui/primitives";
import { ReferralTimeline } from "@/components/referrals/referral-timeline";
import { STATUS_LABEL, TRANSITIONS, type ReferralStatus } from "@/features/referrals/state-machine";
import { api, ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";

export interface ClinicianReferral {
  id: string;
  status: ReferralStatus;
  urgency: string;
  reason: string | null;
  requestedAt: string;
  patientName: string;
  patientId: string;
  hasSharingConsent?: boolean;
  events: { id: string; toStatus: string; actorRole: string; note: string | null; createdAt: string }[];
}

const ACTION_LABEL: Partial<Record<ReferralStatus, string>> = {
  ACKNOWLEDGED: "Acknowledge",
  SCHEDULED: "Schedule",
  COMPLETED: "Mark completed",
  DECLINED: "Decline",
  UNABLE_TO_CONTACT: "Unable to contact",
  CANCELLED: "Cancel",
};

export function ClinicianReferralCard({ referral: r, showPatient }: { referral: ClinicianReferral; showPatient?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scheduleAt, setScheduleAt] = useState(() => {
    const d = new Date(Date.now() + 3 * 86_400_000);
    d.setHours(10, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [note, setNote] = useState("");

  async function go(to: ReferralStatus) {
    setBusy(to);
    setError(null);
    try {
      await api(`/api/referrals/${r.id}/transition`, {
        body: { to, note: note.trim() || null, scheduledFor: to === "SCHEDULED" ? new Date(scheduleAt).toISOString() : undefined },
      });
      setNote("");
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update");
    } finally {
      setBusy(null);
    }
  }

  const next = TRANSITIONS[r.status];
  return (
    <Card className="p-5" data-testid="clinician-referral">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          {showPatient ? (
            <Link href={`/clinician/patients/${r.patientId}`} className="font-semibold text-ink hover:underline">{r.patientName}</Link>
          ) : (
            <p className="font-semibold text-ink">Referral</p>
          )}
          <p className="text-xs text-muted">Requested {formatDate(r.requestedAt)} · urgency {r.urgency.toLowerCase()}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge tone="sky">{STATUS_LABEL[r.status]}</Badge>
        </div>
      </div>
      {r.reason ? (
        <p className="mt-2 rounded-xl bg-sand/40 p-2.5 text-sm text-ink-soft">“{r.reason}”</p>
      ) : r.hasSharingConsent === false ? (
        <p className="mt-2 text-xs text-muted">Reason hidden — no active sharing consent.</p>
      ) : null}
      <ReferralTimeline status={r.status} events={r.events} />
      {next.length > 0 && (
        <div className="mt-4 space-y-2">
          {next.includes("SCHEDULED") && (
            <label className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
              Appointment
              <Input type="datetime-local" className="h-9 w-auto" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
            </label>
          )}
          <Input className="h-9" placeholder="Optional note for the referral history" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
          <div className="flex flex-wrap gap-2">
            {next.map((to) => (
              <Button
                key={to}
                size="sm"
                variant={["DECLINED", "CANCELLED", "UNABLE_TO_CONTACT"].includes(to) ? "ghost" : "primary"}
                onClick={() => go(to)}
                disabled={!!busy}
                data-testid={`transition-${to}`}
              >
                {busy === to && <Loader2 className="animate-spin" aria-hidden />} {ACTION_LABEL[to]}
              </Button>
            ))}
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-safety-700">{error}</p>}
    </Card>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, Field, SimulatedBadge, Textarea } from "@/components/ui/primitives";
import { ReferralTimeline } from "./referral-timeline";
import { STATUS_LABEL, TERMINAL, type ReferralStatus } from "@/features/referrals/state-machine";
import { api, ApiError } from "@/lib/api-client";
import { formatDate, formatDateTime } from "@/lib/utils";

export interface PatientReferral {
  id: string;
  status: ReferralStatus;
  urgency: string;
  isSimulated: boolean;
  reason: string | null;
  requestedAt: string;
  clinicianName: string | null;
  clinicianOrg: string | null;
  resourceName: string | null;
  events: { id: string; toStatus: string; actorRole: string; note: string | null; createdAt: string }[];
  followUps: { id: string; scheduledFor: string; status: string }[];
}

export function ReferralList({ referrals, demoMode }: { referrals: PatientReferral[]; demoMode: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, kind: "cancel" | "simulate") {
    setBusy(id + kind);
    setError(null);
    try {
      if (kind === "cancel") await api(`/api/referrals/${id}/transition`, { body: { to: "CANCELLED" } });
      else await api(`/api/referrals/${id}/simulate-ack`, { method: "POST" });
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  if (!referrals.length) {
    return <EmptyState title="No referrals yet" description="When you request a referral, you'll be able to follow each step here." />;
  }
  return (
    <div className="space-y-3">
      {error && <p role="alert" className="rounded-xl bg-safety-50 px-3 py-2 text-sm text-safety-700">{error}</p>}
      {referrals.map((r) => (
        <Card key={r.id} className="p-5" data-testid="patient-referral">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-ink">{r.clinicianName ?? r.resourceName}</p>
              <p className="text-xs text-muted">{r.clinicianOrg ?? "Self-referral tracking"} · requested {formatDate(r.requestedAt)} · {r.urgency.toLowerCase()}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge tone={r.status === "COMPLETED" ? "sage" : TERMINAL.has(r.status) ? "neutral" : "sky"}>{STATUS_LABEL[r.status]}</Badge>
              {r.isSimulated && <SimulatedBadge />}
            </div>
          </div>
          <ReferralTimeline status={r.status} events={r.events} />
          {r.followUps.length > 0 && (
            <p className="mt-2 text-sm text-ink-soft">
              Follow-up: {r.followUps.map((f) => `${formatDateTime(f.scheduledFor)} (${f.status.toLowerCase()})`).join(", ")}
            </p>
          )}
          {r.isSimulated && (
            <p className="mt-3 text-xs text-muted">
              This referral is part of the prototype. No real clinic has received it, and “acknowledged” only reflects a synthetic or simulated clinician.
            </p>
          )}
          {!TERMINAL.has(r.status) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {demoMode && r.status === "REQUESTED" && !r.clinicianName && (
                <Button size="sm" variant="soft" onClick={() => act(r.id, "simulate")} disabled={!!busy}>
                  {busy === r.id + "simulate" && <Loader2 className="animate-spin" aria-hidden />} Simulate acknowledgement
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => act(r.id, "cancel")} disabled={!!busy}>
                <X aria-hidden /> Cancel request
              </Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

export function RequestReferral({
  clinicians,
  resources,
}: {
  clinicians: { id: string; name: string; title: string; organization: string; isSynthetic: boolean }[];
  resources: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [urgency, setUrgency] = useState<"ROUTINE" | "SOON" | "URGENT">("ROUTINE");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!target) return setError("Choose who you'd like to be referred to.");
    setPending(true);
    setError(null);
    const [kind, id] = target.split(":");
    try {
      await api("/api/referrals", {
        body: { clinicianId: kind === "c" ? id : null, resourceId: kind === "r" ? id : null, urgency, reason: reason.trim() || null },
      });
      setOpen(false);
      setTarget("");
      setReason("");
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create referral.");
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Plus aria-hidden /> Request a referral
      </Button>
    );
  }
  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-ink">Request a referral</p>
        <SimulatedBadge label="Simulated workflow" />
      </div>
      <Field label="Who would you like to see?" htmlFor="target">
        <select id="target" value={target} onChange={(e) => setTarget(e.target.value)} className="h-11 rounded-xl border border-line bg-surface px-3 text-[15px]">
          <option value="">Choose…</option>
          <optgroup label="Demo clinicians (synthetic)">
            {clinicians.map((c) => (
              <option key={c.id} value={`c:${c.id}`}>{c.name} — {c.title}, {c.organization}</option>
            ))}
          </optgroup>
          <optgroup label="Services (track your own referral)">
            {resources.map((r) => (
              <option key={r.id} value={`r:${r.id}`}>{r.name}</option>
            ))}
          </optgroup>
        </select>
      </Field>
      <fieldset>
        <legend className="text-sm font-medium text-ink-soft">How soon?</legend>
        <div className="mt-2 flex gap-2">
          {(["ROUTINE", "SOON", "URGENT"] as const).map((u) => (
            <button key={u} type="button" aria-pressed={urgency === u} onClick={() => setUrgency(u)} className={`rounded-full border px-3.5 py-1.5 text-sm ${urgency === u ? "border-teal-500 bg-teal-50 text-teal-700" : "border-line text-ink-soft"}`}>
              {u === "ROUTINE" ? "Routine" : u === "SOON" ? "Within a week" : "As soon as possible"}
            </button>
          ))}
        </div>
        {urgency === "URGENT" && (
          <p className="mt-2 text-xs text-safety-700">If you are in danger now, don't wait for a referral — call 998 or 999, or 800-SAKINA (800 725462).</p>
        )}
      </fieldset>
      <Field label="What would you like help with? (optional)" htmlFor="reason" hint="Shared with the clinician only while your sharing consent is active.">
        <Textarea id="reason" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {error && <p role="alert" className="rounded-xl bg-safety-50 px-3 py-2 text-sm text-safety-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button onClick={submit} disabled={pending}>{pending && <Loader2 className="animate-spin" aria-hidden />} Send request</Button>
      </div>
    </Card>
  );
}

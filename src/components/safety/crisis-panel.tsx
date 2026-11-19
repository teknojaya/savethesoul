"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing, CheckCircle2, Loader2, Users, Wind, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SimulatedBadge } from "@/components/ui/primitives";
import { EmergencyContacts } from "./emergency-contacts";
import { BreathingGuide } from "./breathing-guide";
import { api, ApiError } from "@/lib/api-client";

type AlertState =
  | { phase: "idle" }
  | { phase: "sending" }
  | { phase: "sent"; recipients: string[] }
  | { phase: "acknowledged" }
  | { phase: "failed"; reason: string };

/**
 * Shown when the safety system detects explicit danger (or the user reports it).
 * Real emergency numbers come first. The care-team alert is patient-initiated and
 * clearly SIMULATED; nothing here contacts a real hospital, police or family member.
 */
export function CrisisPanel({ safetyEventId, demoMode }: { safetyEventId: string | null; demoMode: boolean }) {
  const [alert, setAlert] = useState<AlertState>({ phase: "idle" });
  const [hospitalCaseRef, setHospitalCaseRef] = useState<string | null>(null);
  const [breathing, setBreathing] = useState(false);

  // Poll for a (simulated) clinician acknowledgement once an alert is sent.
  useEffect(() => {
    if (alert.phase !== "sent" || !safetyEventId) return;
    const t = setInterval(async () => {
      try {
        const { event } = await api<{ event: { workflowStatus: string } }>(`/api/safety/events/${safetyEventId}`);
        if (event.workflowStatus === "SIMULATED_ACKNOWLEDGED") setAlert({ phase: "acknowledged" });
      } catch {
        /* keep polling */
      }
    }, 4000);
    return () => clearInterval(t);
  }, [alert.phase, safetyEventId]);

  async function sendAlert() {
    if (!safetyEventId) return;
    setAlert({ phase: "sending" });
    try {
      const res = await api<{ status: string; recipients?: string[]; reason?: string; hospitalCaseRef?: string }>(`/api/safety/events/${safetyEventId}/alert`, { method: "POST" });
      if (res.hospitalCaseRef) setHospitalCaseRef(res.hospitalCaseRef);
      if (res.status === "HANDOFF_FAILED") setAlert({ phase: "failed", reason: res.reason ?? "No care team connected." });
      else if (res.status === "SIMULATED_ACKNOWLEDGED") setAlert({ phase: "acknowledged" });
      else setAlert({ phase: "sent", recipients: res.recipients ?? [] });
    } catch (e) {
      setAlert({ phase: "failed", reason: e instanceof ApiError ? e.message : "The alert could not be sent." });
    }
  }

  async function simulateAck() {
    if (!safetyEventId) return;
    try {
      await api(`/api/safety/events/${safetyEventId}/simulate-ack`, { method: "POST" });
      setAlert({ phase: "acknowledged" });
    } catch {
      /* ignore */
    }
  }

  return (
    <section
      aria-labelledby="crisis-title"
      className="animate-fade-up rounded-3xl border border-safety-100 bg-surface p-4 shadow-lift sm:p-5"
      data-testid="crisis-panel"
    >
      <h2 id="crisis-title" className="font-display text-xl text-safety-700">Reach a person now</h2>
      <p className="mt-1 text-sm text-ink-soft">These connect you to trained people. Your phone places the call.</p>
      <div className="mt-4">
        <EmergencyContacts compact />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-line p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 font-medium text-ink"><BellRing className="size-4 text-brand-600" aria-hidden /> Alert my care team</p>
            <SimulatedBadge />
          </div>
          <p className="mt-1 text-xs text-muted">
            Demonstrates how your connected clinician could be notified. In this prototype no real clinician or hospital receives it.
          </p>
          <div className="mt-3" aria-live="polite">
            {alert.phase === "idle" && (
              <Button size="sm" variant="secondary" onClick={sendAlert} disabled={!safetyEventId} data-testid="send-sim-alert">
                Send simulated alert
              </Button>
            )}
            {alert.phase === "sending" && <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" aria-hidden /> Sending…</p>}
            {alert.phase === "sent" && (
              <div className="space-y-2 text-sm">
                <p className="text-ink-soft">
                  Simulated alert sent to {alert.recipients.join(", ")}. Waiting for acknowledgement… <strong>Please don't wait — use the numbers above if you're in danger.</strong>
                </p>
                {demoMode && (
                  <Button size="sm" variant="ghost" onClick={simulateAck}>
                    Simulate clinician acknowledgement
                  </Button>
                )}
              </div>
            )}
            {alert.phase === "acknowledged" && (
              <p className="flex items-start gap-2 text-sm text-sage-700" data-testid="sim-ack">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
                Simulated acknowledgement received. In a real service, this would mean a clinician has seen the alert — it would not replace emergency services.
              </p>
            )}
            {hospitalCaseRef && (
              <p className="mt-2 rounded-xl bg-sand px-3 py-2 text-xs text-ink-soft" data-testid="hospital-demo-case">
                <strong>Demo only:</strong> a simulated case ({hospitalCaseRef}) was opened in the synthetic hospital dashboard. No real hospital or emergency responder has been notified.
              </p>
            )}
            {alert.phase === "failed" && (
              <p className="flex items-start gap-2 text-sm text-safety-700" data-testid="handoff-failed">
                <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {alert.reason} Please call one of the numbers above.
              </p>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-line p-4">
          <p className="flex items-center gap-2 font-medium text-ink"><Users className="size-4 text-brand-600" aria-hidden /> Someone you trust</p>
          <p className="mt-1 text-xs text-muted">Call a family member or friend, or send a simulated message from your Trusted Circle.</p>
          <Link href="/patient/circle" className="mt-3 inline-flex text-sm font-medium text-brand-700 hover:underline">Open Trusted Circle & safety plan</Link>
        </div>
      </div>

      <div className="mt-4">
        <Button size="sm" variant="soft" onClick={() => setBreathing((b) => !b)}>
          <Wind aria-hidden /> {breathing ? "Hide breathing exercise" : "Breathing exercise"}
        </Button>
        {breathing && <div className="mt-3"><BreathingGuide /></div>}
      </div>
    </section>
  );
}

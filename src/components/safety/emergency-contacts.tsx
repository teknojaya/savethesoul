"use client";

import { Phone, ShieldAlert, HeartHandshake, ExternalLink, Globe } from "lucide-react";
import { EMERGENCY_RESOURCES, type SupportResourceData } from "@/features/safety/resources";
import { cn } from "@/lib/utils";

function track(code: string) {
  try {
    navigator.sendBeacon?.("/api/safety/telemetry", new Blob([JSON.stringify({ code })], { type: "application/json" }));
  } catch {
    /* telemetry must never block a call */
  }
}

/**
 * Real, verified emergency and crisis numbers. Static (no DB/LLM dependency) so it
 * always renders. Calls use tel: links — the user's own phone places the call.
 */
export function EmergencyContacts({ compact = false, className }: { compact?: boolean; className?: string }) {
  const emergency = EMERGENCY_RESOURCES.filter((r) => r.category === "EMERGENCY");
  const lines = EMERGENCY_RESOURCES.filter((r) => r.category === "CRISIS_LINE");
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <p data-testid="service-area-note" className="flex items-start gap-1.5 rounded-xl bg-surface px-3 py-2 text-xs text-ink-soft">
        <Globe className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          <strong className="font-semibold text-ink">These are United Arab Emirates numbers</strong> (SaveTheSoul is built for Abu Dhabi). Outside the UAE? Call
          your local emergency number instead, for example 112 in the EU, 911 in the US and Canada, or 999 in the UK.
        </span>
      </p>
      <div className="grid grid-cols-2 gap-3">
        {emergency.map((r) => (
          <CallTile key={r.slug} r={r} tone="safety" compact={compact} />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {lines.map((r) => (
          <CallTile key={r.slug} r={r} tone="teal" compact={compact} wide />
        ))}
      </div>
    </div>
  );
}

function CallTile({ r, tone, compact, wide }: { r: SupportResourceData; tone: "safety" | "teal"; compact?: boolean; wide?: boolean }) {
  const Icon = tone === "safety" ? ShieldAlert : HeartHandshake;
  return (
    <a
      href={`tel:${r.dial}`}
      onClick={() => track("CALL_TAPPED")}
      className={cn(
        "group flex items-center gap-3 rounded-2xl border p-4 transition-colors",
        tone === "safety"
          ? "border-safety-100 bg-safety-50 hover:bg-safety-100"
          : "border-teal-100 bg-teal-50 hover:bg-teal-100",
        wide ? "" : "flex-col items-start sm:flex-row sm:items-center",
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full text-white",
          tone === "safety" ? "bg-safety-500" : "bg-teal-600",
        )}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block font-semibold", tone === "safety" ? "text-safety-700" : "text-teal-900")}>
          {wide ? r.name : r.name.split(" (")[0]}
        </span>
        <span className="block text-lg font-semibold tabular-nums text-ink">{r.phone}</span>
        {!compact && (
          <span className="mt-0.5 block text-xs text-muted">
            {r.hours}
            {r.languages ? ` · ${r.languages}` : ""}
            {r.verificationStatus === "NEEDS_VERIFICATION" && " · hours unverified"}
          </span>
        )}
      </span>
      <Phone className="hidden size-5 text-muted group-hover:text-ink sm:block" aria-hidden />
    </a>
  );
}

export function SourceNote() {
  return (
    <p className="flex items-start gap-1.5 text-xs text-muted">
      <ExternalLink className="mt-0.5 size-3 shrink-0" aria-hidden />
      Numbers verified on 18 Nov 2026 against the UAE Government portal (u.ae) and Department of Health – Abu Dhabi announcements. In the UAE, always call 999 / 998 in an emergency.
    </p>
  );
}

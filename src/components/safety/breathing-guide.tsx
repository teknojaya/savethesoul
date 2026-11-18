"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const PHASES = [
  { label: "Breathe in", seconds: 4 },
  { label: "Hold", seconds: 1 },
  { label: "Breathe out slowly", seconds: 5 },
] as const;

/** Paced breathing (≈6 breaths/min). Works fully offline. */
export function BreathingGuide() {
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setPhase((p) => (p + 1) % PHASES.length), PHASES[phase].seconds * 1000);
    return () => clearTimeout(t);
  }, [running, phase]);

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-sage-100 bg-sage-50 p-6 text-center">
      <div className="relative flex size-36 items-center justify-center">
        <div
          className={`absolute inset-0 rounded-full bg-sage-300/60 ${running ? "animate-breathe" : "scale-75"}`}
          aria-hidden
        />
        <div className="relative rounded-full bg-surface/80 px-4 py-2 text-sm font-medium text-sage-700" aria-live="polite">
          {running ? PHASES[phase].label : "Ready"}
        </div>
      </div>
      <p className="max-w-xs text-sm text-ink-soft">
        Slow breathing with a longer out-breath can help your body settle. Follow the circle for a minute or two.
      </p>
      <Button variant="secondary" size="sm" onClick={() => { setRunning((r) => !r); setPhase(0); }}>
        {running ? "Stop" : "Start breathing exercise"}
      </Button>
    </div>
  );
}

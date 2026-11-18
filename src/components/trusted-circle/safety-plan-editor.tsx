"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Textarea } from "@/components/ui/primitives";
import { api } from "@/lib/api-client";
import { formatDateTime } from "@/lib/utils";

const STEPS = [
  { key: "warningSigns", title: "1. My warning signs", hint: "Thoughts, feelings or situations that tell me a crisis may be starting." },
  { key: "copingStrategies", title: "2. Things I can do on my own", hint: "Activities that help me feel calmer or distracted." },
  { key: "peopleAndPlaces", title: "3. People and places that help", hint: "Who I can be with, or where I can go, to take my mind off things." },
  { key: "reasonsForLiving", title: "4. What matters to me", hint: "Reasons for living and things I'm looking forward to." },
  { key: "professionalContacts", title: "5. Professionals and services I can contact", hint: "Including 24/7 crisis lines." },
  { key: "makingSafe", title: "6. Making my environment safer", hint: "Steps to reduce access to things I could use to harm myself." },
] as const;

type Plan = Record<(typeof STEPS)[number]["key"], string>;

export function SafetyPlanEditor({ initial }: { initial: Plan & { updatedAt: string | null } }) {
  const { updatedAt, ...rest } = initial;
  const [plan, setPlan] = useState<Plan>(rest);
  const [saved, setSaved] = useState<string | null>(updatedAt);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const { saved } = await api<{ saved: { updatedAt: string } }>("/api/safety/plan", { method: "PUT", body: plan });
      setSaved(saved.updatedAt);
      setDirty(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="grid gap-4 md:grid-cols-2">
        {STEPS.map((s) => (
          <div key={s.key}>
            <label htmlFor={`sp-${s.key}`} className="font-medium text-ink">{s.title}</label>
            <p className="mb-1.5 text-xs text-muted">{s.hint}</p>
            <Textarea
              id={`sp-${s.key}`}
              rows={3}
              maxLength={1500}
              value={plan[s.key]}
              onChange={(e) => { setPlan({ ...plan, [s.key]: e.target.value }); setDirty(true); }}
            />
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-muted">{saved ? `Last saved ${formatDateTime(saved)}` : "Not saved yet"}</p>
        <Button onClick={save} disabled={busy || !dirty}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} Save plan
        </Button>
      </div>
    </Card>
  );
}

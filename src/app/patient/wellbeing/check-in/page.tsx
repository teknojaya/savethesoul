"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, CheckCircle2, HeartHandshake } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Callout, Card, Textarea } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const MOODS = [
  { v: 1, face: "😞", label: "Very low" },
  { v: 2, face: "🙁", label: "Low" },
  { v: 3, face: "😐", label: "Okay" },
  { v: 4, face: "🙂", label: "Good" },
  { v: 5, face: "😊", label: "Very good" },
];

function Scale({ label, value, onChange, low, high }: { label: string; value: number | null; onChange: (v: number | null) => void; low: string; high: string }) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-ink-soft">{label} <span className="font-normal text-muted">(optional)</span></legend>
      <div className="mt-2 flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={value === n}
            onClick={() => onChange(value === n ? null : n)}
            className={cn("h-10 flex-1 rounded-xl border text-sm font-medium tabular-nums", value === n ? "border-teal-500 bg-teal-50 text-teal-700" : "border-line bg-surface text-ink-soft")}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted"><span>{low}</span><span>{high}</span></div>
    </fieldset>
  );
}

export default function CheckInPage() {
  const router = useRouter();
  const [mood, setMood] = useState<number | null>(null);
  const [stress, setStress] = useState<number | null>(null);
  const [sleep, setSleep] = useState<number | null>(null);
  const [func, setFunc] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ safety: { level: string } | null } | null>(null);

  async function submit() {
    if (!mood) {
      setError("Choose how you're feeling to save your check-in.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await api<{ safety: { level: string } | null }>("/api/wellbeing/check-ins", {
        body: { mood, stress, sleepQuality: sleep, functioning: func, note: note.trim() || null },
      });
      setDone(res);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save.");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-lg animate-fade-up space-y-4 text-center">
        <CheckCircle2 className="mx-auto size-12 text-sage-500" aria-hidden />
        <h1 className="font-display text-3xl text-ink">Check-in saved</h1>
        <p className="text-ink-soft">Noticing how you feel is a skill. Thank you for taking a moment for yourself.</p>
        {done.safety && (
          <Callout tone="safety" icon={<HeartHandshake />} className="text-start">
            Something in your note sounded really hard. If you're thinking about harming yourself, please reach out now — <a href="tel:800725462" className="font-semibold underline">800-SAKINA (800 725462)</a> is available 24/7, or call <a href="tel:998" className="font-semibold underline">998</a> in an emergency. <Link href="/help" className="font-semibold underline">More help</Link>
          </Callout>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <Link href="/patient/wellbeing" className={buttonVariants({ variant: "secondary" })}>See my trends</Link>
          <Link href="/patient/companion" className={buttonVariants()}>Talk to the companion</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <Link href="/patient/wellbeing" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> My wellbeing
      </Link>
      <h1 className="font-display text-[30px] leading-tight text-ink">How are you feeling today?</h1>
      <Card className="mt-5 space-y-6 p-5">
        <fieldset>
          <legend className="text-sm font-medium text-ink-soft">Mood</legend>
          <div className="mt-2 grid grid-cols-5 gap-1.5">
            {MOODS.map((m) => (
              <button
                key={m.v}
                type="button"
                aria-pressed={mood === m.v}
                onClick={() => setMood(m.v)}
                className={cn("flex flex-col items-center gap-1 rounded-2xl border px-1 py-3 text-xs", mood === m.v ? "border-teal-500 bg-teal-50 text-teal-700" : "border-line bg-surface text-muted")}
              >
                <span className="text-2xl" aria-hidden>{m.face}</span>
                {m.label}
              </button>
            ))}
          </div>
        </fieldset>
        <Scale label="Stress" value={stress} onChange={setStress} low="None" high="Very high" />
        <Scale label="Sleep quality last night" value={sleep} onChange={setSleep} low="Very poor" high="Very good" />
        <Scale label="Managing daily tasks" value={func} onChange={setFunc} low="Very hard" high="Very well" />
        <div>
          <label htmlFor="note" className="text-sm font-medium text-ink-soft">A note for yourself <span className="font-normal text-muted">(optional, private, encrypted)</span></label>
          <Textarea id="note" rows={3} maxLength={1000} className="mt-2" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What's affecting how you feel today?" />
        </div>
        {error && <p role="alert" className="rounded-xl bg-safety-50 px-3 py-2 text-sm text-safety-700">{error}</p>}
        <Button size="lg" className="w-full" onClick={submit} disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />} Save check-in
        </Button>
      </Card>
    </div>
  );
}

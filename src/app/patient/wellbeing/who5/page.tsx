"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Compass, LifeBuoy } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Callout, Card } from "@/components/ui/primitives";
import { WHO5_ITEMS, WHO5_OPTIONS, WHO5_LIMITATIONS } from "@/features/assessments/who5";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface Result {
  assessment: { rawScore: number; percentScore: number };
  interpretation: { headline: string; explanation: string; suggestProfessional: boolean; band: string };
  trend: { explanations: string[]; suggestProfessionalFollowUp: boolean };
}

export default function Who5Page() {
  const [answers, setAnswers] = useState<(number | null)[]>([null, null, null, null, null]);
  const [missing, setMissing] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function submit() {
    const miss = answers.map((a, i) => (a === null ? i + 1 : 0)).filter(Boolean);
    setMissing(miss);
    if (miss.length) {
      setError(`Please answer question${miss.length > 1 ? "s" : ""} ${miss.join(", ")}.`);
      return;
    }
    setPending(true);
    setError(null);
    try {
      setResult(await api<Result>("/api/wellbeing/who5", { body: { answers } }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save your answers.");
    } finally {
      setPending(false);
    }
  }

  if (result) {
    const r = result;
    return (
      <div className="mx-auto max-w-2xl animate-fade-up space-y-5" data-testid="who5-result">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-600">Your WHO-5 result</p>
        <Card className="p-6 text-center">
          <p className="font-display text-6xl text-ink tabular-nums">{r.assessment.percentScore}</p>
          <p className="text-sm text-muted">out of 100 · raw score {r.assessment.rawScore}/25</p>
          <div className="mx-auto mt-4 h-2 max-w-sm overflow-hidden rounded-full bg-sand" aria-hidden>
            <div className="h-full rounded-full bg-teal-500" style={{ width: `${r.assessment.percentScore}%` }} />
          </div>
          <h1 className="mt-5 font-display text-2xl text-ink">{r.interpretation.headline}</h1>
          <p className="mx-auto mt-2 max-w-lg text-ink-soft">{r.interpretation.explanation}</p>
        </Card>
        {r.trend.explanations.length > 0 && (
          <Card className="p-5">
            <p className="font-semibold text-ink">Compared with before</p>
            <ul className="mt-2 space-y-1.5 text-sm text-ink-soft">
              {r.trend.explanations.map((e) => <li key={e}>• {e}</li>)}
            </ul>
          </Card>
        )}
        {(r.interpretation.suggestProfessional || r.trend.suggestProfessionalFollowUp) && (
          <Callout tone="info" icon={<Compass />}>
            A healthcare professional can help you understand what's behind these feelings. You can explore verified Abu Dhabi services or share a summary with a clinician — only if you choose to.
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/patient/support" className={buttonVariants({ size: "sm" })}>Find support</Link>
              <Link href="/patient/support/share" className={buttonVariants({ size: "sm", variant: "secondary" })}>Share a summary</Link>
            </div>
          </Callout>
        )}
        <Callout tone="safety" icon={<LifeBuoy />}>
          The WHO-5 doesn't measure risk of self-harm. If you're having thoughts of harming yourself, please <Link href="/help" className="font-semibold underline">get immediate help</Link>.
        </Callout>
        <div className="flex flex-wrap gap-2">
          <Link href="/patient/wellbeing" className={buttonVariants({ variant: "secondary" })}>See my trends</Link>
          <Link href="/patient/companion" className={buttonVariants({ variant: "ghost" })}>Talk it through with the companion</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/patient/wellbeing" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> My wellbeing
      </Link>
      <h1 className="font-display text-[30px] leading-tight text-ink">WHO-5 Well-Being Index</h1>
      <p className="mt-1 text-ink-soft">
        For each statement, choose the answer closest to how you have been feeling <strong>over the last two weeks</strong>.
      </p>

      <ol className="mt-6 space-y-4">
        {WHO5_ITEMS.map((item, i) => (
          <li key={item}>
            <fieldset className={cn("rounded-2xl border bg-surface p-4 shadow-soft sm:p-5", missing.includes(i + 1) ? "border-safety-500" : "border-line/70")}>
              <legend className="sr-only">{`Question ${i + 1}: ${item}`}</legend>
              <p className="font-medium text-ink" aria-hidden>
                <span className="me-2 text-teal-600">{i + 1}.</span>
                {item}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {WHO5_OPTIONS.map((o) => (
                  <label
                    key={o.value}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors",
                      answers[i] === o.value ? "border-teal-500 bg-teal-50 text-teal-900" : "border-line text-ink-soft hover:bg-sand/50",
                    )}
                  >
                    <input
                      type="radio"
                      name={`q${i}`}
                      value={o.value}
                      checked={answers[i] === o.value}
                      onChange={() => {
                        const next = [...answers];
                        next[i] = o.value;
                        setAnswers(next);
                        setMissing((m) => m.filter((x) => x !== i + 1));
                      }}
                      className="accent-teal-600"
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </li>
        ))}
      </ol>

      {error && <p role="alert" className="mt-4 rounded-xl bg-safety-50 px-3 py-2 text-sm text-safety-700">{error}</p>}
      <div className="mt-6 flex items-center justify-between gap-3">
        <p className="text-xs text-muted">{answers.filter((a) => a !== null).length} of 5 answered</p>
        <Button size="lg" onClick={submit} disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />} See my result
        </Button>
      </div>
      <details className="mt-6 text-sm text-muted">
        <summary className="cursor-pointer font-medium text-ink-soft">What the WHO-5 can and can't tell you</summary>
        <ul className="mt-2 space-y-1">{WHO5_LIMITATIONS.map((l) => <li key={l}>• {l}</li>)}</ul>
      </details>
    </div>
  );
}

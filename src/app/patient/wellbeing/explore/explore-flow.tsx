"use client";

import { useState } from "react";
import Link from "next/link";
import { ClipboardList, HeartHandshake, Loader2, MessageCircleHeart, Sparkles } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Callout, Card, CardContent, CardDescription, CardHeader, CardTitle, Textarea } from "@/components/ui/primitives";
import { RichText } from "@/components/chat/rich-text";
import { CONCERN_AREAS, CONCERN_DURATION, CONCERN_FREQUENCY, CONCERN_IMPACT, HELP_WANTED } from "@/features/consent/policy";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type Key<T> = keyof T;
interface Answers {
  areas: Key<typeof CONCERN_AREAS>[];
  duration: Key<typeof CONCERN_DURATION> | "";
  frequency: Key<typeof CONCERN_FREQUENCY> | "";
  dailyLifeImpact: Key<typeof CONCERN_IMPACT> | "";
  helpWanted: Key<typeof HELP_WANTED> | "";
  sleep: "GOOD" | "OK" | "POOR" | "";
  stress: "LOW" | "MEDIUM" | "HIGH" | "";
}
type Result =
  | { kind: "safety"; level: string; text: string }
  | { kind: "summary"; label: string; ai: string | null; answers: Record<string, unknown>; unclear: string[]; wellbeing: { headline: string; points: string[]; suggestProfessional: boolean } };

const SLEEP = { GOOD: "Fairly well", OK: "So-so", POOR: "Poorly" } as const;
const STRESS = { LOW: "Low", MEDIUM: "Moderate", HIGH: "High" } as const;
/** Hand-off to the share flow (sessionStorage, this tab only; nothing is stored on the server). */
export const EXPLORE_HANDOFF_KEY = "sts:explore-concerns";

export function ExploreFlow({ name }: { name: string }) {
  const [consent, setConsent] = useState(false);
  const [a, setA] = useState<Answers>({ areas: [], duration: "", frequency: "", dailyLifeImpact: "", helpWanted: "", sleep: "", stress: "" });
  const [words, setWords] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const complete = a.areas.length > 0 && a.duration && a.frequency && a.dailyLifeImpact && a.sleep && a.stress;
  const chip = (on: boolean) => cn("rounded-full border px-3 py-1.5 text-sm", on ? "border-brand-500 bg-brand-50 text-brand-800" : "border-line bg-surface text-ink-soft");
  const one = <K extends "duration" | "frequency" | "dailyLifeImpact" | "helpWanted" | "sleep" | "stress">(key: K, options: Record<string, string>, legend: string, optional = false) => (
    <fieldset>
      <legend className="text-sm font-medium text-ink">
        {legend} {optional && <span className="font-normal text-muted">(optional)</span>}
      </legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {Object.entries(options).map(([k, label]) => (
          <button key={k} type="button" aria-pressed={a[key] === k} className={chip(a[key] === k)} onClick={() => setA({ ...a, [key]: k })}>
            {label}
          </button>
        ))}
      </div>
    </fieldset>
  );

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<Result>("/api/wellbeing/explore", { body: { ...a, helpWanted: a.helpWanted || null, ownWords: words.trim() || null, consent: true } });
      setResult(r);
      try {
        sessionStorage.setItem(EXPLORE_HANDOFF_KEY, JSON.stringify({ areas: a.areas, duration: a.duration, frequency: a.frequency, dailyLifeImpact: a.dailyLifeImpact, helpWanted: a.helpWanted }));
      } catch {
        /* optional convenience */
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (result?.kind === "safety") {
    return (
      <Callout tone="safety" data-testid="explore-safety">
        <RichText text={result.text} />
        <Link href="/help" className={cn(buttonVariants({ variant: "safety", size: "sm" }), "mt-3")}>Get help now</Link>
      </Callout>
    );
  }

  if (result?.kind === "summary") {
    return (
      <div className="space-y-4" data-testid="explore-result">
        <p className="rounded-xl border border-amber-500/30 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700" data-testid="explore-label">
          {result.label}
        </p>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-brand-600" aria-hidden /> Your preliminary insights</CardTitle>
            <CardDescription>{result.wellbeing.headline} This is not a diagnosis.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {result.ai ? (
              <pre className="whitespace-pre-wrap font-sans text-ink-soft" data-testid="explore-ai">{result.ai}</pre>
            ) : (
              <p className="text-ink-soft" data-testid="explore-no-ai">
                AI insights aren&apos;t available right now, so this is a plain summary of your answers and records.
              </p>
            )}
            {result.wellbeing.points.length > 0 && (
              <ul className="space-y-0.5 text-ink-soft">
                {result.wellbeing.points.map((p) => <li key={p}>• {p}</li>)}
              </ul>
            )}
            <div className="rounded-xl bg-primary-subtle p-3">
              <p className="text-xs font-semibold text-ink">What is still uncertain</p>
              <ul className="mt-1 space-y-0.5 text-ink-soft">{result.unclear.map((u) => <li key={u}>• {u}</li>)}</ul>
            </div>
          </CardContent>
        </Card>
        <div className="flex flex-wrap gap-2">
          <Link href="/patient/support/share?from=explore" className={buttonVariants()} data-testid="explore-prepare-summary"><ClipboardList aria-hidden /> Prepare a summary for my clinician</Link>
          <Link href="/patient/support" className={buttonVariants({ variant: "secondary" })}><HeartHandshake aria-hidden /> Find professional support</Link>
          <Link href="/patient/companion" className={buttonVariants({ variant: "secondary" })}><MessageCircleHeart aria-hidden /> Talk it through with Sakinah</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Before you start, {name}</CardTitle>
          <CardDescription>
            This is an <strong>AI-assisted preliminary assessment</strong>. Sakinah will organise what you share with your own WHO-5 results and check-ins into an explanation,
            point out what is uncertain, and help you prepare for a professional. It cannot diagnose, and only a licensed professional can assess what this means for you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex items-start gap-2 text-sm text-ink-soft" data-testid="explore-consent">
            <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>I agree that my answers and my wellbeing results are processed by AI (OpenAI, from SaveTheSoul&apos;s server) for this preliminary explanation. Nothing from it is saved unless I choose to share a summary.</span>
          </label>
        </CardContent>
      </Card>
      {consent && (
        <Card>
          <CardContent className="space-y-5 pt-5">
            <fieldset>
              <legend className="text-sm font-medium text-ink">What are you finding difficult?</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {(Object.keys(CONCERN_AREAS) as Key<typeof CONCERN_AREAS>[]).map((k) => {
                  const on = a.areas.includes(k);
                  return (
                    <button key={k} type="button" aria-pressed={on} className={chip(on)} onClick={() => setA({ ...a, areas: on ? a.areas.filter((x) => x !== k) : [...a.areas, k] })}>
                      {CONCERN_AREAS[k]}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            {one("duration", CONCERN_DURATION, "For how long?")}
            {one("frequency", CONCERN_FREQUENCY, "How often?")}
            {one("dailyLifeImpact", CONCERN_IMPACT, "How much does it affect work, study, relationships or daily tasks?")}
            {one("sleep", SLEEP, "How have you been sleeping?")}
            {one("stress", STRESS, "How stressed have you felt?")}
            {one("helpWanted", HELP_WANTED, "What kind of help would you like?", true)}
            <div>
              <label htmlFor="own-words" className="text-sm font-medium text-ink">In your own words <span className="font-normal text-muted">(optional)</span></label>
              <Textarea id="own-words" rows={3} maxLength={600} value={words} onChange={(e) => setWords(e.target.value)} className="mt-2" placeholder="Anything else you'd like Sakinah to consider…" />
            </div>
            {error && <p role="alert" className="text-sm text-safety-700">{error}</p>}
            <Button size="lg" onClick={run} disabled={!complete || busy} data-testid="explore-run">
              {busy && <Loader2 className="animate-spin" aria-hidden />} See my preliminary insights
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

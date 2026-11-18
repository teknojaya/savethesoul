import Link from "next/link";
import { ClipboardCheck, Smile, TrendingDown, TrendingUp, Minus, Info, Compass } from "lucide-react";
import { requirePatientPage } from "@/lib/auth/current-user";
import { getWellbeingOverview } from "@/server/services/wellbeing.service";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Callout, PageHeader, Stat, EmptyState } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";
import { CheckInChart, Who5TrendChart } from "@/components/wellbeing/charts";
import { GoalsManager } from "@/components/wellbeing/goals-manager";
import { WHO5_LIMITATIONS } from "@/features/assessments/who5";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "My Wellbeing" };

function delta(recent: number | null, prior: number | null) {
  if (recent === null) return "—";
  if (prior === null) return `${recent}`;
  const d = Math.round((recent - prior) * 10) / 10;
  return `${recent} (${d > 0 ? "+" : ""}${d})`;
}

export default async function WellbeingPage() {
  const actor = await requirePatientPage();
  const o = await getWellbeingOverview(actor.patientId);
  const TrendIcon = o.trend.direction === "declining" ? TrendingDown : o.trend.direction === "improving" ? TrendingUp : Minus;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="My wellbeing"
        title="How you've been doing"
        description="Your check-ins and WHO-5 results, explained in plain language. Only you can see this unless you choose to share it."
        actions={
          <>
            <Link href="/patient/wellbeing/check-in" className={buttonVariants({ variant: "secondary" })}>
              <Smile aria-hidden /> Check in
            </Link>
            <Link href="/patient/wellbeing/who5" className={buttonVariants()}>
              <ClipboardCheck aria-hidden /> Take WHO-5
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Latest WHO-5" value={o.trend.latest ? `${o.trend.latest.percentScore}/100` : "—"} hint={o.trend.latest ? formatDate(o.trend.latest.completedAt) : "No results yet"} />
        <Stat
          label="Change since last"
          value={
            <span className="inline-flex items-center gap-1.5">
              <TrendIcon className="size-5 text-muted" aria-hidden />
              {o.trend.changeFromPrevious !== null ? `${o.trend.changeFromPrevious > 0 ? "+" : ""}${o.trend.changeFromPrevious}` : "—"}
            </span>
          }
          hint={o.trend.meaningfulChange ? "Meaningful change (≥10)" : "Within normal variation"}
        />
        <Stat label="Mood · last 7 days" value={delta(o.checkInSummary.mood.recent, o.checkInSummary.mood.prior)} hint="Average 1–5 (vs. week before)" />
        <Stat label="Check-ins · last 7 days" value={o.checkInSummary.recentCount} hint="Self-reported" />
      </div>

      {o.trend.suggestProfessionalFollowUp && (
        <Callout tone="info" icon={<Compass />}>
          <p className="font-semibold">Talking with a professional may help</p>
          <p className="mt-0.5">{o.trend.explanations.at(-1)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/patient/support" className={buttonVariants({ size: "sm" })}>See support options</Link>
            <Link href="/patient/support/share" className={buttonVariants({ size: "sm", variant: "secondary" })}>Share a summary with a clinician</Link>
          </div>
        </Callout>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>WHO-5 Well-Being Index</CardTitle>
            <CardDescription>Higher is better. A change of 10 points or more is considered meaningful.</CardDescription>
          </CardHeader>
          <CardContent>
            {o.assessments.length ? (
              <Who5TrendChart data={o.assessments.map((a) => ({ date: a.completedAt.toISOString(), percentScore: a.percentScore }))} />
            ) : (
              <EmptyState icon={<ClipboardCheck />} title="No WHO-5 results yet" description="Five short questions about the last two weeks." action={<Link href="/patient/wellbeing/who5" className={buttonVariants({ size: "sm" })}>Start</Link>} />
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>What this means</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-ink-soft">
            {o.latestInterpretation && (
              <div className="rounded-xl bg-sand/50 p-3">
                <p className="font-semibold text-ink">{o.latestInterpretation.headline}</p>
                <p className="mt-1">{o.latestInterpretation.explanation}</p>
              </div>
            )}
            <ul className="space-y-2">
              {o.trend.explanations.map((e) => (
                <li key={e} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal-500" aria-hidden /> {e}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily check-ins · last 60 days</CardTitle>
          <CardDescription>Mood and sleep: higher is better. Stress: higher means more stress.</CardDescription>
        </CardHeader>
        <CardContent>
          {o.checkIns.length ? (
            <CheckInChart data={o.checkIns.map((c) => ({ createdAt: c.createdAt.toISOString(), mood: c.mood, sleepQuality: c.sleepQuality, stress: c.stress }))} />
          ) : (
            <EmptyState icon={<Smile />} title="No check-ins yet" description="A quick daily check-in helps you notice patterns." />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card id="goals">
          <CardHeader>
            <CardTitle>Personal wellbeing goals</CardTitle>
            <CardDescription>Small, specific and kind to yourself works best.</CardDescription>
          </CardHeader>
          <CardContent>
            <GoalsManager goals={o.goals.map((g) => ({ id: g.id, title: g.title, status: g.status }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Info className="size-4 text-sky-700" aria-hidden /> About the WHO-5</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-ink-soft">
              {WHO5_LIMITATIONS.map((l) => (
                <li key={l} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-sky-500" aria-hidden /> {l}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">WHO-5 © World Health Organization, 1998. Scoring: five items 0–5, raw score ×4 = 0–100.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

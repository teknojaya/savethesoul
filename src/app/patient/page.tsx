import Link from "next/link";
import { MessageCircleHeart, ClipboardCheck, Smile, ArrowRight, Compass, Users, ShieldCheck, Target, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { requirePatientPage } from "@/lib/auth/current-user";
import { getWellbeingOverview } from "@/server/services/wellbeing.service";
import { getDashboardExtras, getPatientProfile } from "@/server/services/patient.service";
import { Card, CardContent, CardHeader, CardTitle, Callout, Badge, SimulatedBadge } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";
import { Sparkline } from "@/components/wellbeing/charts";
import { STATUS_LABEL, type ReferralStatus } from "@/features/referrals/state-machine";
import { cn, relativeDays } from "@/lib/utils";

export const metadata = { title: "Home" };

function greeting() {
  const h = Number(new Date().toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Dubai" }));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function PatientDashboard() {
  const actor = await requirePatientPage();
  const [profile, overview, extras] = await Promise.all([
    getPatientProfile(actor.patientId),
    getWellbeingOverview(actor.patientId),
    getDashboardExtras(actor.patientId),
  ]);
  const { trend, latestInterpretation, goals } = overview;
  const TrendIcon = trend.direction === "declining" ? TrendingDown : trend.direction === "improving" ? TrendingUp : Minus;
  const checkedInToday = extras.lastCheckIn && relativeDays(extras.lastCheckIn.createdAt) === "today";

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <p className="text-sm text-muted">{greeting()},</p>
        <h1 className="font-display text-[34px] leading-tight text-ink">{profile.preferredName}</h1>
        <p className="mt-1 text-ink-soft">How are you feeling today?</p>
      </div>

      {trend.suggestProfessionalFollowUp && (
        <Callout tone="info" icon={<Compass />}>
          <p className="font-semibold">It might help to talk with a professional</p>
          <p className="mt-0.5">
            {trend.latestIsLow
              ? "Your latest WHO-5 score is in a range where speaking with a healthcare professional is recommended."
              : "Your wellbeing scores have been going down over several check-ins."}{" "}
            This isn't a diagnosis — it's a signal worth acting on.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/patient/support" className={buttonVariants({ size: "sm" })}>Find support</Link>
            <Link href="/patient/support/share" className={buttonVariants({ size: "sm", variant: "secondary" })}>Share a summary with a clinician</Link>
          </div>
        </Callout>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/patient/companion" className="group rounded-2xl bg-brand-600 p-5 text-white shadow-soft transition hover:bg-brand-700">
          <MessageCircleHeart className="size-6" aria-hidden />
          <p className="mt-4 font-display text-xl">Talk to your companion</p>
          <p className="mt-1 text-sm text-brand-50/90">A private space to think out loud. AI — not a clinician.</p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium">
            {extras.lastConversation ? "Continue" : "Start a conversation"} <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden />
          </span>
        </Link>

        <Link href="/patient/wellbeing/check-in" className="group rounded-2xl border border-line/70 bg-surface p-5 shadow-soft transition hover:shadow-lift">
          <Smile className="size-6 text-sage-700" aria-hidden />
          <p className="mt-4 font-display text-xl text-ink">Daily check-in</p>
          <p className="mt-1 text-sm text-muted">
            {checkedInToday ? "Done for today — nice work." : extras.lastCheckIn ? `Last check-in ${relativeDays(extras.lastCheckIn.createdAt)}.` : "Takes 30 seconds."}
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-700">
            {checkedInToday ? "Check in again" : "Check in now"} <ArrowRight className="size-4" aria-hidden />
          </span>
        </Link>

        <Link href="/patient/wellbeing" className="group rounded-2xl border border-line/70 bg-surface p-5 shadow-soft transition hover:shadow-lift sm:col-span-2 lg:col-span-1">
          <div className="flex items-start justify-between">
            <ClipboardCheck className="size-6 text-sky-700" aria-hidden />
            <Sparkline values={overview.assessments.map((a) => a.percentScore)} />
          </div>
          <p className="mt-3 text-sm text-muted">WHO-5 wellbeing</p>
          {trend.latest ? (
            <>
              <p className="font-display text-3xl text-ink tabular-nums">
                {trend.latest.percentScore}
                <span className="text-base text-muted">/100</span>
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-soft">
                <TrendIcon className="size-4" aria-hidden /> {latestInterpretation?.headline}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-ink-soft">Take the 2-minute WHO-5 to start tracking.</p>
          )}
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Target className="size-4 text-brand-600" aria-hidden /> Your goals</CardTitle>
            <Link href="/patient/wellbeing#goals" className="text-sm font-medium text-brand-700 hover:underline">Manage</Link>
          </CardHeader>
          <CardContent>
            {goals.filter((g) => g.status === "ACTIVE").length ? (
              <ul className="space-y-2">
                {goals.filter((g) => g.status === "ACTIVE").slice(0, 4).map((g) => (
                  <li key={g.id} className="flex items-center gap-2 rounded-xl bg-sage-50 px-3 py-2 text-sm text-ink">
                    <span className="size-1.5 rounded-full bg-sage-500" aria-hidden /> {g.title}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Set a small, kind goal for yourself — like a short walk or calling a friend.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Compass className="size-4 text-brand-600" aria-hidden /> Care & support</CardTitle>
            <Link href="/patient/support" className="text-sm font-medium text-brand-700 hover:underline">Open</Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {extras.openReferrals.length ? (
              extras.openReferrals.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-line/70 px-3 py-2.5 text-sm">
                  <span className="truncate">{r.clinician?.user.displayName ?? r.resource?.name}</span>
                  <span className="flex items-center gap-1.5">
                    <Badge tone="sky">{STATUS_LABEL[r.status as ReferralStatus]}</Badge>
                    {r.isSimulated && <SimulatedBadge />}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted">No active referrals. Explore verified services in Abu Dhabi whenever you're ready.</p>
            )}
            <div className="flex flex-wrap gap-2 pt-1 text-sm">
              <Link href="/patient/circle" className={cn(buttonVariants({ size: "sm", variant: "soft" }))}>
                <Users aria-hidden /> {extras.contacts ? `${extras.contacts} trusted contact${extras.contacts > 1 ? "s" : ""}` : "Add a trusted contact"}
              </Link>
              <Link href="/patient/circle#safety-plan" className={cn(buttonVariants({ size: "sm", variant: "soft" }))}>
                <ShieldCheck aria-hidden /> {extras.safetyPlanUpdatedAt ? "Your safety plan" : "Create a safety plan"}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

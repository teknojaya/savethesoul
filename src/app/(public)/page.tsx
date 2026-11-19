import Link from "next/link";
import { SakinahAvatar } from "@/components/companion/sakinah-avatar";
import {
  MessageCircleHeart,
  LineChart,
  Stethoscope,
  ShieldCheck,
  Users,
  LockKeyhole,
  ArrowRight,
  HeartHandshake,
  Sparkles,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PILLARS = [
  {
    icon: MessageCircleHeart,
    title: "Talk it through",
    body: "A warm, private AI companion for stress, worry, loneliness and everyday difficulties — with grounding exercises and gentle reflection when you need them.",
    tone: "bg-teal-50 text-teal-700",
  },
  {
    icon: LineChart,
    title: "Notice changes early",
    body: "Short check-ins and the validated WHO-5 wellbeing index help you see how you're really doing over time — explained clearly, never as a diagnosis.",
    tone: "bg-sky-50 text-sky-700",
  },
  {
    icon: Stethoscope,
    title: "Connect to real care",
    body: "When it would help, find verified Abu Dhabi services, share a summary you've approved with a clinician, and track your referral.",
    tone: "bg-sage-50 text-sage-700",
  },
];

const PRINCIPLES = [
  { icon: ShieldCheck, title: "Safety first, always", body: "A dedicated safety layer works even when the AI is offline, and real emergency numbers are one tap away on every screen." },
  { icon: LockKeyhole, title: "You control your data", body: "Granular, revocable consent. Your conversations are never shared with clinicians, family or employers by default." },
  { icon: Users, title: "People you trust", body: "Add family or friends to your circle — and decide exactly what, if anything, they're told." },
  { icon: HeartHandshake, title: "Humans make the decisions", body: "The AI never diagnoses, prescribes, or contacts anyone on its own. Clinicians review everything shared." },
];

export default function LandingPage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -end-32 -top-32 size-[28rem] rounded-full bg-teal-100/60 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -start-24 top-40 size-72 rounded-full bg-sage-100/70 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-4 pb-16 pt-12 sm:px-6 md:grid-cols-[1.1fr_0.9fr] md:items-center md:pt-20">
          <div className="animate-fade-up">
            <p className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-teal-100 bg-surface px-3 py-1 text-xs font-medium text-teal-700">
              <Sparkles className="size-3.5" aria-hidden /> Earlier, safer mental wellbeing support · Abu Dhabi
            </p>
            <h1 className="font-display text-[40px] leading-[1.05] text-ink sm:text-[56px]">
              Your AI companion.
              <br />
              <span className="text-teal-600">Your wellbeing.</span>
              <br />
              Your connection to real care.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ink-soft">
              SaveTheSoul is a private space to talk through what's on your mind, notice how you're really doing, and reach the right people — from a trusted friend to a psychiatrist — when it matters.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className={buttonVariants({ size: "lg" })}>
                Get started <ArrowRight aria-hidden />
              </Link>
              <Link href="/login" className={buttonVariants({ size: "lg", variant: "secondary" })}>
                Try the demo
              </Link>
            </div>
            <p className="mt-4 text-sm text-muted">
              An AI wellbeing companion — not a doctor, not a diagnosis, not a replacement for care.
            </p>
          </div>

          {/* Preview card */}
          <div className="animate-fade-up [animation-delay:120ms]">
            <div className="mx-auto max-w-sm rounded-3xl border border-line/70 bg-surface p-4 shadow-lift">
              <div className="flex items-center justify-between border-b border-line/60 pb-3">
                <div className="flex items-center gap-2">
                  <SakinahAvatar className="size-8" />
                  <div className="leading-tight">
                    <p className="text-sm font-semibold">Sakinah · Wellbeing Companion</p>
                    <p className="text-[11px] text-muted">AI support · not a clinician</p>
                  </div>
                </div>
                <span className="rounded-full bg-safety-50 px-2 py-0.5 text-[11px] font-semibold text-safety-700">Get help</span>
              </div>
              <div className="space-y-3 py-4 text-sm">
                <div className="ms-auto max-w-[85%] rounded-2xl rounded-ee-md bg-teal-600 px-3.5 py-2.5 text-white">
                  Work has been non-stop and I can't switch off at night.
                </div>
                <div className="max-w-[90%] rounded-2xl rounded-es-md bg-sand/70 px-3.5 py-2.5 text-ink">
                  That sounds exhausting. When work follows you home, your body can stay on alert. Would a two-minute wind-down exercise help tonight?
                </div>
                <div className="rounded-2xl border border-sky-100 bg-sky-50 p-3">
                  <p className="text-xs font-semibold text-sky-700">WHO-5 wellbeing · last 8 weeks</p>
                  <div className="mt-2 flex h-14 items-end gap-1.5" aria-hidden>
                    {[72, 64, 52, 44, 36].map((v, i) => (
                      <div key={i} className="flex-1 rounded-t-md bg-sky-500/70" style={{ height: `${v}%` }} />
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-sky-700">A steady decline — talking with a professional may help.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-4 md:grid-cols-3">
          {PILLARS.map((p) => (
            <div key={p.title} className="rounded-3xl border border-line/70 bg-surface p-6 shadow-soft">
              <span className={cn("mb-4 inline-flex size-11 items-center justify-center rounded-2xl", p.tone)}>
                <p.icon className="size-5" aria-hidden />
              </span>
              <h2 className="font-display text-xl text-ink">{p.title}</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Principles */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="rounded-3xl bg-teal-900 px-6 py-10 text-teal-50 sm:px-10">
          <h2 className="font-display text-3xl">Built around safety, consent and human care</h2>
          <p className="mt-2 max-w-2xl text-teal-100/80">
            Technology can make support more accessible. Decisions about diagnosis, treatment and emergencies stay with qualified people.
          </p>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {PRINCIPLES.map((p) => (
              <div key={p.title} className="flex gap-3">
                <p.icon className="mt-0.5 size-5 shrink-0 text-sage-300" aria-hidden />
                <div>
                  <h3 className="font-semibold text-white">{p.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-teal-100/80">{p.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For clinicians */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-4 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-4 rounded-3xl border border-line/70 bg-surface p-6 shadow-soft sm:flex-row sm:items-center sm:p-8">
          <div>
            <h2 className="font-display text-2xl text-ink">For psychiatrists and care teams</h2>
            <p className="mt-1 max-w-xl text-muted">
              Review patient-approved summaries, WHO-5 history and referrals in a secure, audited portal. AI-generated drafts are always labelled unverified until you review them.
            </p>
          </div>
          <Link href="/login" className={buttonVariants({ variant: "secondary" })}>
            Clinician sign in
          </Link>
        </div>
      </section>
    </div>
  );
}

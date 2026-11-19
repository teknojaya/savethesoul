"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Stethoscope, ShieldCheck, LifeBuoy, Loader2, ArrowRight, ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SakinahAvatar } from "@/components/companion/sakinah-avatar";
import { Card, Callout } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const AGE_BANDS = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"] as const;

function Toggle({ checked, onChange, label, description, locked }: { checked: boolean; onChange?: (v: boolean) => void; label: string; description: string; locked?: boolean }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-4 rounded-2xl border p-4 transition-colors", checked ? "border-brand-200 bg-brand-50/60" : "border-line bg-surface")}>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-ink">{label}</span>
        <span className="mt-0.5 block text-sm text-muted">{description}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        disabled={locked}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      <span
        aria-hidden
        className={cn(
          "relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500",
          checked ? "bg-brand-600" : "bg-line",
          locked && "opacity-70",
        )}
      >
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", checked ? "start-[22px]" : "start-0.5")} />
      </span>
    </label>
  );
}

export function OnboardingWizard({ name }: { name: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [prefs, setPrefs] = useState({ chatHistoryEnabled: true, memoryEnabled: false, aggregateAnalytics: false, ageBand: null as string | null });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish() {
    setPending(true);
    setError(null);
    try {
      await api("/api/onboarding", { body: { aiProcessing: true, ...prefs } });
      router.replace("/patient");
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong");
      setPending(false);
    }
  }

  return (
    <div className="animate-fade-up">
      <div className="mb-6 flex gap-1.5" aria-label={`Step ${step + 1} of 3`}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={cn("h-1.5 flex-1 rounded-full", i <= step ? "bg-brand-500" : "bg-line")} />
        ))}
      </div>

      {step === 0 && (
        <section>
          <h1 className="font-display text-[34px] leading-tight text-ink">Welcome, {name}.</h1>
          <p className="mt-2 text-lg text-ink-soft">
            SaveTheSoul is a private place to talk things through, notice how you're doing, and connect with real support when you want it.
          </p>
          <div className="mt-6 grid gap-3">
            {[
              { icon: null, title: "I'm Sakinah, your AI wellbeing companion", body: "I'm not a person, a psychiatrist or a doctor. I can listen, reflect and suggest general wellbeing ideas." },
              { icon: Stethoscope, title: "Real care stays with real professionals", body: "I can't diagnose, prescribe or make treatment decisions — but I can help you find people who can." },
              { icon: LifeBuoy, title: "Help is always one tap away", body: "If you're ever in danger, the Help button shows real emergency and crisis numbers — even if the AI is offline." },
            ].map((x) => (
              <Card key={x.title} className="flex gap-4 p-4">
                {x.icon ? (
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                    <x.icon className="size-5" aria-hidden />
                  </span>
                ) : (
                  <SakinahAvatar className="size-10" />
                )}
                <div>
                  <p className="font-semibold text-ink">{x.title}</p>
                  <p className="text-sm text-muted">{x.body}</p>
                </div>
              </Card>
            ))}
          </div>
          <div className="mt-8 flex justify-end">
            <Button size="lg" onClick={() => setStep(1)}>
              Continue <ArrowRight aria-hidden />
            </Button>
          </div>
        </section>
      )}

      {step === 1 && (
        <section>
          <h1 className="font-display text-[30px] leading-tight text-ink">Your privacy, your choices</h1>
          <p className="mt-2 text-ink-soft">You can change any of these later in Profile & Privacy.</p>
          <div className="mt-6 flex flex-col gap-3">
            <Toggle
              checked
              locked
              label="AI processing of your messages (required for the companion)"
              description="Your messages are sent securely from our server to an AI model to generate replies. A separate safety check runs first. Without this, you can still use check-ins and find support."
            />
            <Toggle
              checked={prefs.chatHistoryEnabled}
              onChange={(v) => setPrefs({ ...prefs, chatHistoryEnabled: v })}
              label="Keep my conversation history"
              description="Saved encrypted so you can come back to past conversations. If off, conversations disappear within 24 hours."
            />
            <Toggle
              checked={prefs.memoryEnabled}
              onChange={(v) => setPrefs({ ...prefs, memoryEnabled: v })}
              label="Personal wellbeing memory"
              description="Lets you save short notes (e.g. “walks help me”) that the companion can remember. You decide every item and can delete them anytime."
            />
            <Toggle
              checked={prefs.aggregateAnalytics}
              onChange={(v) => setPrefs({ ...prefs, aggregateAnalytics: v })}
              label="Contribute to anonymous service statistics"
              description="Your check-in counts and scores may be included in aggregate, de-identified reports that help improve services. Never your conversations."
            />
          </div>
          <div className="mt-6">
            <p className="text-sm font-medium text-ink-soft">Age band (optional — helps check the service works fairly for everyone)</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {AGE_BANDS.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setPrefs({ ...prefs, ageBand: prefs.ageBand === b ? null : b })}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm",
                    prefs.ageBand === b ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line bg-surface text-ink-soft",
                  )}
                  aria-pressed={prefs.ageBand === b}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-8 flex justify-between">
            <Button variant="ghost" onClick={() => setStep(0)}>
              <ArrowLeft aria-hidden /> Back
            </Button>
            <Button size="lg" onClick={() => setStep(2)}>
              Continue <ArrowRight aria-hidden />
            </Button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section>
          <h1 className="font-display text-[30px] leading-tight text-ink">What stays private</h1>
          <ul className="mt-5 space-y-3 text-[15px] text-ink-soft">
            {[
              "Your conversations are never shown to clinicians, family or employers unless you choose to share them with your own clinician.",
              "A clinician only sees a summary you've previewed and approved — and loses access when you revoke it.",
              "Trusted contacts are only messaged when you choose, with the categories you allow.",
              "We never contact police, hospitals or family automatically because of something you typed.",
              "You can export or delete your data at any time.",
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <Check className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
          <Callout tone="brand" icon={<ShieldCheck />} className="mt-6">
            This is a prototype. Clinicians in the demo are synthetic and any alerts or referrals are simulated.
          </Callout>
          {error && <p role="alert" className="mt-4 rounded-xl bg-safety-50 px-3 py-2 text-sm text-safety-700">{error}</p>}
          <div className="mt-8 flex justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}>
              <ArrowLeft aria-hidden /> Back
            </Button>
            <Button size="lg" onClick={finish} disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />} I understand — let's begin
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

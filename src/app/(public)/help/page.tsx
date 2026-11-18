import type { Metadata } from "next";
import Link from "next/link";
import { EmergencyContacts, SourceNote } from "@/components/safety/emergency-contacts";
import { BreathingGuide } from "@/components/safety/breathing-guide";
import { HelpTelemetry } from "@/components/safety/help-telemetry";
import { Callout } from "@/components/ui/primitives";
import { Info } from "lucide-react";

export const metadata: Metadata = { title: "Get help now" };

/**
 * Public, static crisis page. No login, no database, no AI — so it works when
 * everything else is down, and it is cached by the service worker for offline use.
 */
export default function HelpPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <HelpTelemetry />
      <h1 className="font-display text-[32px] leading-tight text-ink">You don't have to face this alone</h1>
      <p className="mt-2 text-[17px] text-ink-soft">
        If you or someone else is in danger right now, please call emergency services. If you need to talk to someone, trained people are available.
      </p>

      <section aria-labelledby="call" className="mt-6">
        <h2 id="call" className="sr-only">Call for help</h2>
        <EmergencyContacts />
        <div className="mt-3"><SourceNote /></div>
      </section>

      <section className="mt-8 space-y-3" aria-labelledby="now">
        <h2 id="now" className="font-display text-xl text-ink">While you reach out</h2>
        <ul className="space-y-2 text-[15px] text-ink-soft">
          <li className="rounded-xl bg-surface p-3 shadow-soft">If you can, move away from anything you could use to hurt yourself.</li>
          <li className="rounded-xl bg-surface p-3 shadow-soft">Go to a place where other people are around, or ask someone to stay with you.</li>
          <li className="rounded-xl bg-surface p-3 shadow-soft">Call or message someone you trust and tell them you need support right now.</li>
          <li className="rounded-xl bg-surface p-3 shadow-soft">Thoughts like these can pass. Getting through the next few minutes is enough.</li>
        </ul>
      </section>

      <section className="mt-8" aria-labelledby="breathe">
        <h2 id="breathe" className="mb-3 font-display text-xl text-ink">Breathe with me</h2>
        <BreathingGuide />
      </section>

      <Callout tone="neutral" icon={<Info />} className="mt-8">
        SaveTheSoul is an AI wellbeing companion. It cannot call emergency services, detect every crisis, or guarantee anyone's safety. In the prototype, alerts to clinicians or family are <strong>simulated</strong> — please use the numbers above to reach real people.{" "}
        <Link href="/patient/circle" className="font-medium text-teal-700 underline-offset-2 hover:underline">
          Your safety plan
        </Link>
      </Callout>
    </div>
  );
}

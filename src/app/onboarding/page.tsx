import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requirePatientPage } from "@/lib/auth/current-user";
import { getPatientProfile } from "@/server/services/patient.service";
import { Logo } from "@/components/brand";
import { OnboardingWizard } from "./wizard";

export const metadata: Metadata = { title: "Welcome" };

export default async function OnboardingPage() {
  const actor = await requirePatientPage();
  const profile = await getPatientProfile(actor.patientId);
  if (profile.onboardingCompleted) redirect("/patient");
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-2xl items-center px-4">
        <Logo href="/" />
      </header>
      <main id="main" className="mx-auto max-w-2xl px-4 pb-16">
        <OnboardingWizard name={profile.preferredName} />
      </main>
    </div>
  );
}

import { redirect } from "next/navigation";
import { requirePatientPage } from "@/lib/auth/current-user";
import { getPatientProfile } from "@/server/services/patient.service";
import { PatientShell } from "@/components/shell/patient-shell";

export default async function PatientLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePatientPage();
  const profile = await getPatientProfile(actor.patientId);
  if (!profile.onboardingCompleted) redirect("/onboarding");
  return (
    <PatientShell name={profile.preferredName} isDemo={actor.isDemo}>
      {children}
    </PatientShell>
  );
}

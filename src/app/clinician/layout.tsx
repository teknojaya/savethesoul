import { requireClinicianPage } from "@/lib/auth/current-user";
import { getClinicianProfile } from "@/server/services/clinician.service";
import { ClinicianShell } from "@/components/shell/clinician-shell";

export default async function ClinicianLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireClinicianPage();
  const profile = await getClinicianProfile(actor.clinicianId);
  return (
    <ClinicianShell name={actor.displayName} title={profile.title} isDemo={actor.isDemo}>
      {children}
    </ClinicianShell>
  );
}

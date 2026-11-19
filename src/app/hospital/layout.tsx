import { requireHospitalPage } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";
import { HospitalShell } from "@/components/shell/hospital-shell";
import { cleanDemoText } from "@/lib/demo-text";
import { hospitalDisplayName } from "@/server/services/emergency.service";

export default async function HospitalLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireHospitalPage();
  const profile = await prisma.hospitalProfile.findUniqueOrThrow({ where: { id: actor.hospitalId } });
  return (
    <HospitalShell name={cleanDemoText(actor.displayName)} organization={hospitalDisplayName(profile.organization)}>
      {children}
    </HospitalShell>
  );
}

import { requireHospitalPage } from "@/lib/auth/current-user";
import { prisma } from "@/lib/db/prisma";
import { HospitalShell } from "@/components/shell/hospital-shell";

export default async function HospitalLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireHospitalPage();
  const profile = await prisma.hospitalProfile.findUniqueOrThrow({ where: { id: actor.hospitalId } });
  return (
    <HospitalShell name={actor.displayName} organization={profile.organization}>
      {children}
    </HospitalShell>
  );
}

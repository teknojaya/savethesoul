import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolveSession, SESSION_COOKIE, type Actor } from "./session";

/** Per-request memoised session lookup for Server Components and Route Handlers. */
export const getCurrentActor = cache(async (): Promise<Actor | null> => {
  const store = await cookies();
  return resolveSession(store.get(SESSION_COOKIE)?.value);
});

/** For pages: redirect to sign-in (or the correct portal) instead of throwing. */
export async function requirePatientPage(): Promise<Actor & { patientId: string }> {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  if (actor.role !== "PATIENT" || !actor.patientId) redirect("/clinician");
  return actor as Actor & { patientId: string };
}

export async function requireClinicianPage(): Promise<Actor & { clinicianId: string }> {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  if (actor.role !== "CLINICIAN" || !actor.clinicianId) redirect("/patient");
  return actor as Actor & { clinicianId: string };
}

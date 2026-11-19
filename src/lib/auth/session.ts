import { prisma } from "@/lib/db/prisma";
import { randomToken, sha256 } from "@/lib/crypto";
import type { UserRole } from "@/generated/prisma/enums";

export const SESSION_COOKIE = "sts_session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

/**
 * The authenticated principal. The role is ALWAYS read from the database,
 * never from anything the client sends.
 */
export interface Actor {
  userId: string;
  role: UserRole;
  displayName: string;
  isDemo: boolean;
  patientId: string | null;
  clinicianId: string | null;
  /** Hospital emergency coordinator profile (synthetic demo portal). */
  hospitalId?: string | null;
}

/** Creates a DB-backed session. Only the SHA-256 hash of the token is stored. */
export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { userId, tokenHash: sha256(token), expiresAt } });
  return { token, expiresAt };
}

export async function revokeSession(token: string): Promise<void> {
  await prisma.session.updateMany({
    where: { tokenHash: sha256(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function resolveSession(token: string | undefined | null): Promise<Actor | null> {
  if (!token || token.length > 200) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      user: {
        include: {
          patientProfile: { select: { id: true } },
          clinicianProfile: { select: { id: true } },
          hospitalProfile: { select: { id: true } },
        },
      },
    },
  });
  if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) return null;
  const { user } = session;
  return {
    userId: user.id,
    role: user.role,
    displayName: user.displayName,
    isDemo: user.isDemo,
    patientId: user.patientProfile?.id ?? null,
    clinicianId: user.clinicianProfile?.id ?? null,
    hospitalId: user.hospitalProfile?.id ?? null,
  };
}

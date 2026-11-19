import { NextResponse } from "next/server";
import { z } from "zod";
import { route, parseJson } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { getEnv } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/db/prisma";
import { createSession } from "@/lib/auth/session";
import { setSessionCookie } from "@/lib/auth/cookies";
import { DEMO_LOGIN_KEYS } from "@/features/demo/accounts";

const Schema = z.object({ account: z.enum(DEMO_LOGIN_KEYS) });

/**
 * One-click sign-in to a SYNTHETIC demo account (demo mode only). The account is chosen from a
 * fixed server-side list and must be flagged as demo, so no password is needed in the browser
 * and no real account can ever be reached this way.
 */
export const POST = route({ public: true }, async ({ req }) => {
  if (!getEnv().DEMO_MODE) throw new AppError("NOT_FOUND", "Not found");
  const { account } = await parseJson(req, Schema);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`demo-login:${ip}`, 30, 15 * 60_000)) throw new AppError("RATE_LIMITED", "Too many sign-ins. Please wait a few minutes.");
  const user = await prisma.user.findUnique({
    where: { email: `${account}@demo.savethesoul.app` },
    include: { patientProfile: { select: { onboardingCompleted: true } } },
  });
  if (!user || !user.isDemo) throw new AppError("NOT_FOUND", "Demo account not available");
  const { token, expiresAt } = await createSession(user.id);
  const redirectTo =
    user.role === "HOSPITAL_COORDINATOR" ? "/hospital" : user.role === "CLINICIAN" ? "/clinician" : user.patientProfile?.onboardingCompleted ? "/patient" : "/onboarding";
  const res = NextResponse.json({ ok: true, role: user.role, redirectTo });
  setSessionCookie(res, token, expiresAt);
  return res;
});

import { NextResponse } from "next/server";
import { route, parseJson } from "@/lib/http";
import { LoginSchema } from "@/lib/validation/schemas";
import { login } from "@/server/services/auth.service";
import { setSessionCookie } from "@/lib/auth/cookies";
import { rateLimit } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/db/prisma";

export const POST = route({ public: true }, async ({ req }) => {
  const input = await parseJson(req, LoginSchema);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`login:${ip}:${input.email}`, 10, 15 * 60_000)) {
    throw new AppError("RATE_LIMITED", "Too many sign-in attempts. Please wait a few minutes.");
  }
  const session = await login(input);
  let redirectTo = "/clinician";
  if (session.role === "PATIENT") {
    const profile = await prisma.patientProfile.findFirst({
      where: { user: { email: input.email } },
      select: { onboardingCompleted: true },
    });
    redirectTo = profile?.onboardingCompleted ? "/patient" : "/onboarding";
  }
  const res = NextResponse.json({ ok: true, role: session.role, redirectTo });
  setSessionCookie(res, session.token, session.expiresAt);
  return res;
});

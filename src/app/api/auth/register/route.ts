import { NextResponse } from "next/server";
import { route, parseJson } from "@/lib/http";
import { RegisterSchema } from "@/lib/validation/schemas";
import { registerPatient } from "@/server/services/auth.service";
import { setSessionCookie } from "@/lib/auth/cookies";
import { rateLimit } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";
import { getEnv } from "@/lib/env";

export const POST = route({ public: true }, async ({ req }) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`register:${ip}`, getEnv().REGISTER_RATE_LIMIT_PER_HOUR, 60 * 60_000)) {
    throw new AppError("RATE_LIMITED", "Too many sign-ups from this network. Please try later.");
  }
  // Any client-supplied "role" field is ignored: the schema doesn't accept it and
  // registration always creates a PATIENT.
  const input = await parseJson(req, RegisterSchema);
  const session = await registerPatient(input);
  const res = NextResponse.json({ ok: true, redirectTo: "/onboarding" }, { status: 201 });
  setSessionCookie(res, session.token, session.expiresAt);
  return res;
});

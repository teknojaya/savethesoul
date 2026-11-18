import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { revokeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { clearSessionCookie } from "@/lib/auth/cookies";

export const POST = route({ public: true }, async ({ req }) => {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(token);
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
});

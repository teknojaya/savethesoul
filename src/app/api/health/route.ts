import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { describeProvider } from "@/features/ai/provider-factory";

export const dynamic = "force-dynamic";

/** Liveness + readiness probe for Railway. Reveals no secrets or user data. */
export async function GET() {
  let database: "ok" | "error" = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "error";
  }
  let ai: { provider: string; generative: boolean } | { provider: "misconfigured" };
  try {
    const p = describeProvider();
    ai = { provider: p.id, generative: p.isGenerative };
  } catch {
    ai = { provider: "misconfigured" };
  }
  const ok = database === "ok";
  return NextResponse.json(
    { status: ok ? "ok" : "degraded", database, ai, time: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}

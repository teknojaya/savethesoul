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
  // Provider, model and live status only: never keys, prompts, replies or error details.
  let ai: Record<string, unknown>;
  try {
    const p = describeProvider();
    ai = {
      selected: p.selected,
      provider: p.id,
      model: p.model,
      generative: p.isGenerative,
      status: p.status,
      lastSuccessAt: p.lastSuccessAt,
      lastFailureCode: p.lastFailureCode,
    };
  } catch {
    ai = { provider: "misconfigured" };
  }
  const ok = database === "ok";
  return NextResponse.json(
    { status: ok ? "ok" : "degraded", database, ai, time: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}

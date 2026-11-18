import { NextResponse, type NextRequest } from "next/server";
import { recordCrisisWorkflowStep } from "@/server/services/safety.service";
import { rateLimit } from "@/lib/rate-limit";

const ALLOWED = new Set(["HELP_OPENED", "CALL_TAPPED"]);

/** Anonymous, aggregate crisis-workflow counter. Stores only a code — no identity, no content. */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`telemetry:${ip}`, 60, 60_000)) return new NextResponse(null, { status: 204 });
  try {
    const { code } = (await req.json()) as { code?: string };
    if (code && ALLOWED.has(code)) await recordCrisisWorkflowStep(code);
  } catch {
    /* ignore malformed beacons */
  }
  return new NextResponse(null, { status: 204 });
}

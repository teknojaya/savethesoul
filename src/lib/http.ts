import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import type { UserRole } from "@/generated/prisma/enums";
import { AppError } from "./errors";
import { getCurrentActor } from "./auth/current-user";
import type { Actor } from "./auth/session";

type Params = Record<string, string | string[] | undefined>;

interface HandlerContext<A> {
  req: NextRequest;
  actor: A;
  params: Params;
}

interface RouteOptions {
  /** Roles allowed to call the endpoint. Omit together with `public: true` for open endpoints. */
  roles?: UserRole[];
  public?: boolean;
}

/**
 * Wraps a Route Handler with:
 *  - server-side authentication and role authorisation (role read from DB, never from client)
 *  - same-origin enforcement for state-changing requests (CSRF defence in depth; cookies are SameSite=Lax)
 *  - uniform error envelopes that never echo request bodies or sensitive content
 */
export function route<A extends Actor | null = Actor>(
  options: RouteOptions,
  handler: (ctx: HandlerContext<A>) => Promise<Response | object | null>,
) {
  return async (req: NextRequest, ctx: { params: Promise<Params> }): Promise<Response> => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
      const actor = await getCurrentActor();
      if (!options.public) {
        if (!actor) throw new AppError("UNAUTHENTICATED", "Please sign in");
        if (options.roles && !options.roles.includes(actor.role)) {
          throw new AppError("FORBIDDEN", "Your role cannot perform this action");
        }
      }
      const params = (await ctx?.params) ?? {};
      const result = await handler({ req, actor: actor as A, params });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true }, { headers: noStore });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

const noStore = { "Cache-Control": "no-store" };

export function errorResponse(err: unknown): Response {
  if (err instanceof AppError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status, headers: noStore },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION",
          message: "Some fields are invalid",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 400, headers: noStore },
    );
  }
  // Name and code only: error messages (e.g. from the database driver) can contain request data.
  const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
  console.error("[api] unhandled error:", err instanceof Error ? `${err.name}${code ? ` (${code})` : ""}` : "unknown");
  return NextResponse.json(
    { error: { code: "INTERNAL", message: "Something went wrong. Please try again." } },
    { status: 500, headers: noStore },
  );
}

export async function parseJson<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new AppError("VALIDATION", "Request body must be valid JSON");
  }
  return schema.parse(body);
}

export function param(params: Params, name: string): string {
  const v = params[name];
  if (typeof v !== "string" || v.length === 0 || v.length > 64) {
    throw new AppError("VALIDATION", `Invalid ${name}`);
  }
  return v;
}

function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients (tests, native app) — still require session cookie / auth
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw new AppError("FORBIDDEN", "Cross-origin request blocked");
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("FORBIDDEN", "Cross-origin request blocked");
  }
}

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Actor } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { makeClinician, makePatient, resetDb } from "../support/fixtures";

// Route handlers read the session from cookies; here we inject the actor directly.
const current: { actor: Actor | null } = { actor: null };
vi.mock("@/lib/auth/current-user", () => ({ getCurrentActor: async () => current.actor }));

const who5 = await import("@/app/api/wellbeing/who5/route");
const conversations = await import("@/app/api/conversations/route");
const clinicianPatients = await import("@/app/api/clinician/patients/route");
const contacts = await import("@/app/api/trusted-contacts/route");
const register = await import("@/app/api/auth/register/route");

beforeEach(async () => {
  await resetDb();
  current.actor = null;
});
afterAll(() => prisma.$disconnect());

const ctx = { params: Promise.resolve({}) };
function req(url: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method: init.method ?? "GET",
    body: init.body,
    headers: { host: "localhost:3000", "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

describe("API authentication & authorization", () => {
  it("returns 401 when not signed in", async () => {
    const res = await conversations.GET(req("/api/conversations"), ctx);
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
  });

  it("returns 403 when a patient calls a clinician endpoint", async () => {
    current.actor = await makePatient();
    const res = await clinicianPatients.GET(req("/api/clinician/patients"), ctx);
    expect(res.status).toBe(403);
  });

  it("returns 403 when a clinician calls a patient endpoint", async () => {
    current.actor = await makeClinician();
    const res = await conversations.GET(req("/api/conversations"), ctx);
    expect(res.status).toBe(403);
  });

  it("blocks cross-origin state-changing requests", async () => {
    current.actor = await makePatient();
    const res = await conversations.POST(req("/api/conversations", { method: "POST", headers: { origin: "https://evil.example" } }), ctx);
    expect(res.status).toBe(403);
  });
});

describe("API validation failures", () => {
  it("rejects malformed JSON", async () => {
    current.actor = await makePatient();
    const res = await who5.POST(req("/api/wellbeing/who5", { method: "POST", body: "{not json" }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION");
  });

  it("rejects out-of-range WHO-5 answers with field details", async () => {
    current.actor = await makePatient();
    const res = await who5.POST(req("/api/wellbeing/who5", { method: "POST", body: JSON.stringify({ answers: [1, 2, 3, 4, 7] }) }), ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.details[0].path).toBe("answers.4");
  });

  it("reports which WHO-5 answers are missing", async () => {
    current.actor = await makePatient();
    const res = await who5.POST(req("/api/wellbeing/who5", { method: "POST", body: JSON.stringify({ answers: [1, null, 3, null, 5] }) }), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error.details.missingItems).toEqual([2, 4]);
  });

  it("scores a complete WHO-5 submission", async () => {
    current.actor = await makePatient();
    const res = await who5.POST(req("/api/wellbeing/who5", { method: "POST", body: JSON.stringify({ answers: [3, 3, 3, 3, 3] }) }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).assessment).toMatchObject({ rawScore: 15, percentScore: 60 });
  });

  it("rejects invalid trusted contacts", async () => {
    current.actor = await makePatient();
    const res = await contacts.POST(
      req("/api/trusted-contacts", { method: "POST", body: JSON.stringify({ name: "", relationship: "Boss", canReceiveUpdates: true }) }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("registration always creates a PATIENT, ignoring any client role", async () => {
    const res = await register.POST(
      req("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email: "new@test.local", password: "longenough123", preferredName: "New", acceptTerms: true, role: "CLINICIAN" }),
      }),
      ctx,
    );
    expect(res.status).toBe(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: "new@test.local" } });
    expect(user.role).toBe("PATIENT");
    expect(res.headers.get("set-cookie")).toMatch(/sts_session=.*HttpOnly/i);
  });

  it("rejects duplicate registration", async () => {
    const body = JSON.stringify({ email: "dup@test.local", password: "longenough123", preferredName: "Dup", acceptTerms: true });
    await register.POST(req("/api/auth/register", { method: "POST", body }), ctx);
    const res = await register.POST(req("/api/auth/register", { method: "POST", body }), ctx);
    expect(res.status).toBe(409);
  });
});

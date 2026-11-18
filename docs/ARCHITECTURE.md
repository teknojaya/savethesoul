# Architecture

## Overview

A single Next.js 16 (App Router) application serves the patient PWA, the clinician portal and a JSON API. This modular monolith suits the MVP. Domain logic is framework-independent so it can later move behind a separate API or be reused by a React Native client.

```
Browser (PWA)  ── HTTPS ──▶  Next.js Route Handlers (/api/*)  ──▶  Services  ──▶  Repositories / Prisma  ──▶  PostgreSQL
   │                              │                                    │
   │  Server Components ──────────┘ (call services directly)           ├──▶ Safety Guardian (pure rules)
   │                                                                    └──▶ AI provider (Anthropic | demo)
   └── Service worker: caches ONLY /help and /offline
```

## Technology

| Layer | Choice |
|---|---|
| UI | Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, shadcn-style components (CVA + tailwind-merge), lucide-react, Recharts |
| API | Route Handlers (Node.js runtime), Zod validation, uniform error envelope |
| Data | PostgreSQL, Prisma 7 (`prisma-client` generator, `@prisma/adapter-pg`), migrations, synthetic seed |
| Auth | Database-backed sessions: a 256-bit random token in an httpOnly, Secure, SameSite=Lax cookie; only its SHA-256 hash is stored. bcrypt password hashes |
| AI | `@anthropic-ai/sdk` (server only), streaming, `effort: low`, server-side refusal fallback; offline demo provider |
| Tests | Vitest (unit + integration), Playwright (E2E) |
| Deploy | Railway (Railpack), `railway.json` with pre-deploy migrations and a health check |

**Cache Components is intentionally disabled.** Almost every screen renders per-user sensitive health data, which should not be cached or prerendered.

## Source layout

```
src/
  app/
    (public)/            landing, login, register, help, offline, privacy notice
    onboarding/          privacy & consent onboarding
    patient/             dashboard, companion, wellbeing, support, circle, privacy
    clinician/           overview, patients, patient detail, referrals, follow-ups, safety, outcomes
    api/                 REST route handlers (one folder per resource)
  components/            ui/, chat/, wellbeing/, safety/, clinician/, referrals/, trusted-circle/, privacy/, shell/
  features/              framework-independent domain logic
    ai/                  provider abstraction, prompts, companion pipeline
    assessments/         WHO-5 scoring and trend analysis
    consent/             consent and notification policy
    referrals/           referral state machine
    safety/              classifier, output guard, response templates, verified resources
  lib/                   auth, db, crypto, env, http wrapper, validation schemas, i18n
  server/
    services/            business rules + authorisation + audit
    repositories/        data access with encryption at the boundary
prisma/                  schema, migrations, seed
tests/                   unit/, integration/, e2e/
docs/
```

## Request lifecycle (API)

`route()` in `src/lib/http.ts` wraps every handler:

1. Rejects cross-origin state-changing requests (an `Origin` that doesn't match the host gets 403).
2. Resolves the session from the cookie. **The role always comes from the database**, never from the client.
3. Enforces allowed roles (401 or 403).
4. Validates input with Zod (400, with field details).
5. Calls a service. Services enforce resource-level authorisation (ownership, assignment and consent) and write audit records.
6. Returns `{ error: { code, message, details } }` on failure. Request bodies are never logged.

## AI chat data flow

```
user message ─▶ assessMessage() ─┬─ IMMEDIATE_DANGER ─▶ crisis template (no LLM) ─▶ crisis panel
                                  ├─ ELEVATED_CONCERN ─▶ LLM + SAFETY MODE prompt ─▶ output guard ─▶ safety check-in card
                                  └─ NO_FLAG ──────────▶ LLM ─────────────────────▶ output guard ─▶ reply
                         any provider error / timeout / refusal ─▶ safe fallback text (+ crisis line)
```

Replies stream to the browser as NDJSON events (`safety`, `delta`, `replace`, `done`, `saved`). Messages are stored encrypted. The pipeline (`features/ai/companion-pipeline.ts`) has no database dependency, so it is unit-tested with fake providers.

## Data model (Prisma)

Identity: `User` (role enum `UserRole`), `Session`, `PatientProfile`, `ClinicianProfile`, `CareAssignment`.
Companion: `Conversation`, `ChatMessage` (encrypted), `WellbeingMemory` (encrypted).
Wellbeing: `WellbeingCheckIn`, `WellbeingAssessment` (WHO-5), `WellbeingGoal`.
Consent and circle: `ConsentRecord` (append-only ledger), `TrustedContact`, `ContactNotification`.
Care: `SupportResource`, `CareReferral`, `ReferralEvent`, `FollowUp`, `ClinicalSummary`, `ClinicianNote`.
Safety and operations: `SafetyEvent` (category codes only), `SafetyPlan` (encrypted), `AuditLog`, `SystemEvent`.

Changes from the requested model list:
- **`UserRole` is an enum** on `User` rather than a table. A user has exactly one role, and it is never client-controlled.
- **`WellbeingTrend` is derived on read**, not stored, so no interpretation is persisted as a clinical fact.
- **`CareAssignment`, `FollowUp`, `WellbeingGoal`, `WellbeingMemory`, `ContactNotification`, `Session` and `SystemEvent` were added.**

## Authorisation model

| Actor | Can access |
|---|---|
| Patient | Only rows linked to their own `PatientProfile` (enforced in every service query) |
| Clinician | A patient only if there is an ACTIVE `CareAssignment` **and** an unrevoked `SHARE_SUMMARY_WITH_CLINICIAN` consent naming that clinician. Only the consented categories are returned. Conversations are never returned |
| Clinician (workflow) | Referrals assigned to them, and follow-ups for assigned patients |

Every clinician access to a patient is written to `AuditLog`, including denied attempts. Patients can see this log under Profile & Privacy.

## Scalability strategy

- Stateless web tier. Sessions live in Postgres, so instances can scale horizontally. The in-memory rate limiter should move to Redis or Postgres when running more than one instance.
- Indexed foreign keys and time-ordered indexes on high-volume tables (messages, check-ins, audit).
- The LLM call is the slowest step. Streaming, an explicit timeout and a single retry keep the interface responsive. Prompt caching can be added for the stable system prompt.
- Future: move `/api` to a dedicated service when the native app launches; queue AI summary generation; move audit logs to append-only storage.

## Native mobile strategy

The React Native (Expo) app would reuse:
- the REST API under `/api` (JSON, no server-component coupling), with bearer sessions instead of cookies;
- `src/lib/validation/schemas.ts` (Zod) and all of `src/features/*` (pure TypeScript);
- the NDJSON streaming protocol for chat.

## Internationalisation

`src/lib/i18n/config.ts` declares locales with their text direction (`en` ltr, `ar` rtl). `<html dir>` is driven from it, layouts use logical CSS properties (`ms-`, `me-`, `ps-`, `start-`, `end-`), and the safety detector already recognises a small set of Arabic phrases.

# SaveTheSoul

**Your AI Companion. Your Mental Wellbeing. Your Connection to Real Care.**

SaveTheSoul is a working prototype of a mental wellbeing companion for Abu Dhabi, built for the **Future Health Digital Innovation Challenge 2026** (category: *Earlier, Safer Mental Wellbeing Support*). It connects four things that are usually separate:

1. **Supportive AI conversation**: a private, warm companion for stress, loneliness, sleep, work and family difficulties.
2. **Early recognition**: daily check-ins and the validated **WHO-5 Well-Being Index**, with plain-language, non-diagnostic trend explanations.
3. **Real professional care**: a verified Abu Dhabi support directory, consent-based clinician summaries, and a tracked referral workflow.
4. **Safe human-led escalation**: an independent Safety Guardian, real emergency numbers on every screen, and patient-initiated (simulated) alerts.

> SaveTheSoul is an **AI wellbeing companion**. It never claims to be a psychiatrist, does not diagnose or prescribe, and does not contact anyone automatically. All clinicians and records in the demo are **synthetic**; all alerts, referrals and family notifications are **simulated**.

## Quick start (local)

Requirements: Node 22+, pnpm, and PostgreSQL 14+ (Docker is easiest).

```bash
# 1. Database (dedicated container on port 5433)
docker run -d --name savethesoul-db -e POSTGRES_USER=sts -e POSTGRES_PASSWORD=sts_dev_password \
  -e POSTGRES_DB=savethesoul -p 5433:5432 postgres:17-alpine

# 2. Configure
cp .env.example .env
#   set DATABASE_URL=postgresql://sts:sts_dev_password@localhost:5433/savethesoul?schema=public
#   set DATA_ENCRYPTION_KEY=$(openssl rand -base64 32)
#   optionally set ANTHROPIC_API_KEY to use Claude instead of the offline demo companion

# 3. Install, migrate, seed, run
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev            # http://localhost:3000
```

Open **/login** and use the one-click demo accounts. The demo password for every synthetic account is `SaveTheSoul-demo-2026`.

| Account | Role | Use it for |
|---|---|---|
| Omar | Patient | Everyday support, urgent safety flow, family support |
| Layla | Patient | Declining WHO-5 trend, sharing a summary with a clinician |
| Dr. Aisha Al Mansoori | Psychiatrist (synthetic) | Clinician portal, referrals, follow-ups, outcomes |
| Dr. James Okafor | Psychologist (synthetic) | Access restrictions (different caseload) |
| yousef@demo.savethesoul.app | Patient | Simulated care-team alert + acknowledgement |

A guided walkthrough for judges is in **[docs/HACKATHON_SUBMISSION.md](docs/HACKATHON_SUBMISSION.md)**.

## AI provider

| `LLM_PROVIDER` | Behaviour |
|---|---|
| `auto` (default) | Claude via the Anthropic API if `ANTHROPIC_API_KEY` is set; otherwise the offline demo companion |
| `anthropic` | Always Claude (model from `LLM_MODEL`, default `claude-opus-5-5`) |
| `demo` | Offline, pre-written supportive responses selected by topic, **clearly labelled in the UI as not AI-generated** |

The safety system runs identically in every mode, and emergency guidance never depends on the model.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Develop, build, serve |
| `pnpm typecheck` / `pnpm lint` | TypeScript and ESLint |
| `pnpm test:unit` | Vitest unit tests (no database) |
| `pnpm test:integration` | Vitest integration tests against `savethesoul_test` (`TEST_DATABASE_URL`) |
| `pnpm test:e2e` | Playwright demo-scenario tests against an isolated `savethesoul_e2e` database |
| `pnpm db:migrate` / `pnpm db:seed` | Apply migrations / reset synthetic demo data |

## Documentation

- [Product vision](docs/PRODUCT_VISION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [AI safety](docs/AI_SAFETY.md)
- [Privacy & consent](docs/PRIVACY_AND_CONSENT.md)
- [Clinical limitations](docs/CLINICAL_LIMITATIONS.md)
- [Deployment (Railway)](docs/DEPLOYMENT.md)
- [Hackathon submission & judge guide](docs/HACKATHON_SUBMISSION.md)

## Status

Prototype. Not a medical device, not clinically validated, and not assessed for regulatory compliance. See [docs/CLINICAL_LIMITATIONS.md](docs/CLINICAL_LIMITATIONS.md).

# Deployment (Railway)

The repository is Railway-ready: `railway.json` defines the build, pre-deploy migrations, start command and health check.

## 1. Create services

1. Create a Railway project with a **PostgreSQL** database service.
2. Add a service from this repository (GitHub) or deploy with `railway up` from the project root.

## 2. Environment variables (web service)

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference variable) |
| `DATA_ENCRYPTION_KEY` | `openssl rand -base64 32`. **Back it up**; losing it makes encrypted fields unreadable |
| `DEMO_MODE` | `true` for the judges' demo, `false` otherwise |
| `LLM_PROVIDER` | `auto` |
| `LLM_MODEL` | `claude-opus-5-5` |
| `LLM_TIMEOUT_MS` | `30000` |
| `ANTHROPIC_API_KEY` | Optional. Without it the offline demo companion is used |
| `NODE_ENV` | `production` (Railway sets this automatically for builds) |

Never commit `.env`. Only `.env.example` is tracked.

## 3. What Railway runs

| Phase | Command |
|---|---|
| Build | `pnpm install` (runs `prisma generate` via `postinstall`), then `pnpm build` |
| Pre-deploy | `pnpm prisma migrate deploy` |
| Start | `pnpm start` (`next start -p $PORT`) |
| Health check | `GET /api/health` returns 200 when the database is reachable, otherwise 503. Reports the AI provider id; never reveals secrets |

## 4. Seed the demo (one time)

The seed **wipes all data**. It refuses to run in production unless explicitly allowed. Run it only on a dedicated demo deployment, using either option:

```bash
# Option A: inside the running service container
railway ssh --service <web-service>
SEED_ALLOW_RESET=true pnpm db:seed

# Option B: from your machine, against the database's public URL
DATABASE_URL="<Postgres DATABASE_PUBLIC_URL>" DATA_ENCRYPTION_KEY="<same key as the service>" \
  SEED_ALLOW_RESET=true pnpm db:seed
```

The seed must use the **same `DATA_ENCRYPTION_KEY`** as the web service, or the app cannot read the seeded encrypted fields.

## 5. Verify

```bash
curl https://<your-domain>/api/health
# {"status":"ok","database":"ok","ai":{"provider":"anthropic","generative":true},...}
```

Then sign in at `/login` with a demo account.

## Production hardening checklist (beyond the hackathon)

- [ ] Host in a UAE region with a health-data-compliant provider; review LLM data residency (see PRIVACY_AND_CONSENT.md).
- [ ] Move `DATA_ENCRYPTION_KEY` to a KMS; add key rotation and re-encryption.
- [ ] Replace the in-memory rate limiter with Redis or Postgres for multi-instance deployments.
- [ ] Add MFA for clinicians and SSO for provider organisations.
- [ ] Ship audit logs to append-only storage; add monitoring and alerting on `SystemEvent` LLM errors and failed hand-offs.
- [ ] Add a Content-Security-Policy with nonces.
- [ ] Set `DEMO_MODE=false` and remove synthetic data.
- [ ] Back up the database (point-in-time recovery).

## Local production check

```bash
pnpm build && PORT=3000 pnpm start
```

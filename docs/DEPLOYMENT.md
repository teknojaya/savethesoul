# Deployment (Railway)

`railway.json` documents the build, pre-deploy migrations, start command and health check. Railway no longer applies config-as-code to newly created services, so set the same values on the service (Settings, or `railway`/MCP `update-service`). The live demo was configured this way.

**Live demo:** project `savethesoul` (separate from all other projects), services `savethesoul-web` and `Postgres`, URL https://savethesoul-web-production.up.railway.app. The database has no public TCP proxy; it is reachable only on Railway's private network. AI: `LLM_PROVIDER=openai`, `LLM_MODEL=gpt-5.4-mini`, with `OPENAI_API_KEY` set as a service variable. Switched over and verified on 19 Nov 2026 following section 6.

## 1. Create services

1. Create a Railway project with a **PostgreSQL** database service.
2. Add a service from this repository (GitHub) or deploy with `railway up` from the project root.

## 2. Environment variables (web service)

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference variable) |
| `DATA_ENCRYPTION_KEY` | `openssl rand -base64 32`. **Back it up**; losing it makes encrypted fields unreadable |
| `DEMO_MODE` | `true` for the judges' demo, `false` otherwise |
| `LLM_PROVIDER` | `openai` (set it only **after** the OpenAI code is deployed, because older builds reject the value) |
| `LLM_MODEL` | `gpt-5.4-mini` (provisional until `pnpm ai:live-check` confirms access) |
| `LLM_TIMEOUT_MS` | `30000` |
| `OPENAI_API_KEY` | Project-scoped key with a monthly budget. Set it yourself: `railway variable set OPENAI_API_KEY --stdin -s savethesoul-web --skip-deploys` |
| `VOICE_STT_MODEL` / `VOICE_TTS_MODEL` / `VOICE_TTS_VOICE` / `VOICE_LANGUAGE` | Optional. Defaults: `gpt-4o-mini-transcribe`, `gpt-4o-mini-tts`, `marin`, `en`. Voice Mode reuses `OPENAI_API_KEY` |
| `SEED_ALLOW_RESET` | `true` only on the dedicated synthetic demo deployment |

Do **not** set `NODE_ENV` as a service variable: it would make the build skip devDependencies. `next start` runs in production mode on its own.

Never commit `.env`. Only `.env.example` is tracked.

## 3. What Railway runs

| Phase | Command |
|---|---|
| Build | `pnpm install` (runs `prisma generate` via `postinstall`), then `pnpm build` |
| Pre-deploy | `pnpm prisma migrate deploy` |
| Start | `pnpm start` (`next start -p $PORT`) |
| Health check | `GET /api/health` returns 200 when the database is reachable, otherwise 503. Reports the AI provider id; never reveals secrets |

## 4. Seed or reset the demo

The seed **wipes all data**. It refuses to run in production unless explicitly allowed. Run it only on a dedicated demo deployment, using either option:

```bash
# Option A (used for the live demo): inside the running service container
railway ssh --service savethesoul-web -- pnpm db:seed

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

## 6. Switching production to OpenAI (verification sequence)

1. Add `OPENAI_API_KEY` to the service with `--skip-deploys`. Never paste it into code, chat or command arguments.
2. Run the live check with the key from Railway, so it never has to be copied: `railway run -s savethesoul-web -- pnpm ai:live-check --models`, then the same command without `--models`. (Or put the key in the local `.env` and run `pnpm ai:live-check`.) All checks must pass.
3. Push to `main` (Railway deploys automatically). While `LLM_PROVIDER=auto`, the new build already selects OpenAI because the key exists.
4. Set `LLM_PROVIDER=openai`.
5. Check `GET /api/health`: `ai.provider` is `openai` and `ai.model` is the expected model. After one real companion reply, `ai.status` becomes `verified`; it starts as `configured_untested` after every deploy.
6. Roll back by setting `LLM_PROVIDER=demo` (the labelled offline companion), or redeploy the previous build in Railway.

If the API rejects the model or key, replies become the labelled fallback message, crisis guidance is unaffected, and `/api/health` shows `status: "unavailable"` with `lastFailureCode: "CONFIG"`.

## Voice Mode release notes

- Migration `20261119091615_voice_processing_consent` adds one enum value (`ALTER TYPE ... ADD VALUE`). It is non-destructive and runs automatically in the pre-deploy step.
- The security header must keep `microphone=(self)`. With `microphone=()` the browser blocks recording; the E2E suite checks this.
- The welcome audio `public/audio/sakinah-welcome.mp3` is generated once with `pnpm exec tsx scripts/generate-welcome-audio.ts`. Regenerate it if the welcome text, voice or model changes.

## Rotating DATA_ENCRYPTION_KEY

`scripts/rotate-encryption-key.ts` re-encrypts every `*Enc` column in one transaction. Without `--apply` it is a dry run that proves the current key decrypts everything. Back up the database first, run the dry run, apply, then switch the variable. The local development key was rotated this way on 19 November 2026. Production uses a different key and was not rotated.

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

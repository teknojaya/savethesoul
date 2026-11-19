# SaveTheSoul

**Your AI Companion. Your Mental Wellbeing. Your Connection to Real Care.**

**Live demo:** https://savethesoul-web-production.up.railway.app (one-click synthetic demo accounts at `/login`). Judge guide: [docs/HACKATHON_SUBMISSION.md](docs/HACKATHON_SUBMISSION.md).

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
#   set OPENAI_API_KEY (project-scoped key) for real AI replies; without it the labelled
#   offline demo companion is used

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

OpenAI is the primary provider, called from the server through the official `openai` SDK and the **Responses API** with streaming.

| `LLM_PROVIDER` | Behaviour |
|---|---|
| `openai` (recommended) | OpenAI, model from `LLM_MODEL` (default `gpt-5.4-mini`). Without `OPENAI_API_KEY` the labelled demo companion is used; it never silently switches to another vendor |
| `demo` | Offline, pre-written supportive responses selected by topic, **clearly labelled in the UI as not AI-generated** |
| `anthropic` | Optional alternative adapter (`ANTHROPIC_API_KEY`) |
| `auto` | OpenAI if its key is set, else Anthropic, else demo |

- **Cost controls:** at most 1,500 output tokens per reply (including reasoning), the last 20 turns of context, low reasoning effort, a 30 s timeout with one retry, and 30 AI replies per patient per minute.
- **Privacy:** requests use `store: false`, so OpenAI does not keep responses for later retrieval. This does not switch off every provider-side retention; see the OpenAI data controls for your account. Messages reach the model only with the patient's AI-processing consent. Saved memories are included only while memory is switched on.
- **Status:** `GET /api/health` reports the selected provider, the model and a status: `demo`, `missing_key`, `configured_untested`, `verified` (only after a real reply succeeded) or `unavailable` (error code only).
- **Live check:** `pnpm ai:live-check` sends eight synthetic conversations, plus a timeout test and an invalid-key test, to the real API. It passed 10/10 on 19 Nov 2026, and the deployed demo runs `gpt-5.4-mini`. `pnpm ai:live-check --models` lists the models your key can use.

The Safety Guardian runs before the model, before the AI rate limit and before the consent check, so a crisis message always gets emergency guidance, even when the AI is unavailable, rate-limited or not permitted.

## Voice Mode: talk with Sakinah

Every **new chat conversation** opens with Sakinah's greeting as the first message, and its recorded audio is attempted once for that conversation (tracked by the chat's identity, so a refresh does not replay it). Where the browser blocks autoplay, a **Tap to hear Sakinah** button is shown. The greeting is a pre-recorded file, so it is never saved, never sent to the AI, and never turns on the microphone. Re-opening an existing conversation does not greet again.

In the companion, tap **Voice** to talk with **Sakinah**, SaveTheSoul's AI wellbeing companion, using push-to-talk.

1. **Start Voice Conversation** plays Sakinah's welcome (a pre-generated MP3, so no paid call on each visit) and shows it as text. The microphone stays off.
2. Tap the microphone, speak, then tap stop (60 s at most). The recording is transcribed (`gpt-4o-mini-transcribe`), and you can review or edit the text, then **Send** it or record again.
3. The text goes through the **normal chat route**, so the Safety Guardian, consent, rate limits, memory and encrypted history are the same as for typed messages. Spoken messages ask the model for shorter, list-free replies.
4. Sakinah reads the saved, safety-checked reply aloud (`gpt-4o-mini-tts`, voice `marin`) in two parts. A short opening is synthesised first, so speech starts sooner.

Controls: stop speaking, replay (cached, with no new paid call), mute, cancel, record again, switch to text (same conversation), and end the session. **Help now** is always visible. A crisis disclosure shows the emergency guidance as soon as the reply arrives, without waiting for audio.

Privacy: voice needs a separate, revocable **Voice processing** consent. Audio is sent from the server to OpenAI and is never stored by SaveTheSoul, and transcripts are saved only if you send them. The speech endpoint accepts only the ID of one of your own saved replies, never free text. **Sakinah is SaveTheSoul's independent AI companion and is not affiliated with the official 800-SAKINA support line**, a separate service in Abu Dhabi that is answered by trained people. The app labels that line as separate wherever emergency help is shown.

## Microphone and clinical support

- **Speak instead of typing:** a 44 px microphone sits beside the message box. Tap it (with voice consent), speak, review or edit the transcript, then Send. The reply to a spoken message is read aloud, and every reply has **Listen**. Same conversation, same Safety Guardian.
- **Sakinah's support:** a structured, psychologically informed approach: explore, summarise, explain common patterns, then one small step. General information is kept separate from her tentative interpretation, she never invents references, never diagnoses or advises on medication, and supports any existing treatment.
- **Wellbeing summary (My Wellbeing):** deterministic and non-diagnostic, with routes to Sakinah, history, professional support, and a summary for a clinician.
- **Clinician hand-off:** patient-reported concerns plus measured data, and an AI case summary labelled *"AI-generated clinical support summary — requires professional review. Not a confirmed diagnosis."* that the clinician can **Approve / Correct / Reject**. Diagnoses and care plans live only in separate **clinician-confirmed findings**. See [docs/CLINICAL_COORDINATION.md](docs/CLINICAL_COORDINATION.md).

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
- [Clinical coordination and escalation](docs/CLINICAL_COORDINATION.md)
- [Deployment (Railway)](docs/DEPLOYMENT.md)
- [Hackathon submission & judge guide](docs/HACKATHON_SUBMISSION.md)

## Status

Prototype. Not a medical device, not clinically validated, and not assessed for regulatory compliance. See [docs/CLINICAL_LIMITATIONS.md](docs/CLINICAL_LIMITATIONS.md).

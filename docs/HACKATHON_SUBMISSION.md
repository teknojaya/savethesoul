# SaveTheSoul: Hackathon Submission

| | |
|---|---|
| **Project** | SaveTheSoul |
| **Competition** | Future Health Digital Innovation Challenge 2026 |
| **Category** | Earlier, Safer Mental Wellbeing Support |
| **Region** | Abu Dhabi, United Arab Emirates |
| **Working prototype** | https://savethesoul-web-production.up.railway.app |
| **Source code** | https://github.com/teknojaya/savethesoul (private; access granted to judges on request) |
| **Data** | Synthetic only. No real patients, clinicians or records |

## 1. Project description

SaveTheSoul is an AI-powered mental wellbeing and connected-care platform. Through Sakinah, users can receive supportive conversations, explore possible mental health concerns, complete wellbeing assessments, and prepare information for qualified healthcare professionals. Clinical diagnoses and treatment decisions remain with licensed professionals.

*AI-assisted wellbeing support and preliminary insights. Not a substitute for professional diagnosis or treatment.*

It combines supportive AI conversation, the validated WHO-5 Wellbeing Index, longitudinal insights the user controls, and clinician-facing summaries the user approves. Together these close the gap between private distress and professional support.

An independent, rule-based **Safety Guardian** puts emergency human resources first and does not rely on the AI. Dedicated clinician and trusted-contact workflows help coordinate care, with consent checked on the server for every access.

A connected-care demo shows the whole path: the patient's own account, a clearly labelled AI preliminary impression, fictional clinician-authored findings, and a **simulated** hospital emergency coordination portal.

**SaveTheSoul does not replace psychiatrists.** It supports individuals between appointments and before they reach care. Qualified healthcare professionals remain responsible for diagnosis, treatment and emergency decisions.

## 2. Problem statement

People often wait until distress becomes a crisis before seeking help. Barriers include stigma, not knowing where to go, waiting lists, cost, language and, for many residents of Abu Dhabi, distance from family. Clinicians in turn meet patients late and with little information about how they have been doing over time.

General-purpose AI chat is increasingly used for emotional support, but it is often unsafe at the edges. It may impersonate a clinician, miss a crisis, or encourage dependence instead of human connection.

## 3. Proposed solution

A mobile-first Progressive Web App for individuals, plus a separate portal for clinicians:

```
 Everyday support ──▶ Early recognition ──▶ Professional care ──▶ Safe escalation
 (AI companion)       (check-ins, WHO-5)    (directory, consented   (real emergency numbers,
                                             summaries, referrals)    patient-initiated alerts)
```

- **Companion:** warm, non-diagnostic conversation, grounding exercises and gentle suggestions to seek human support. It is always labelled as AI and as not a clinician.
- **Early recognition:** WHO-5 assessments, mood check-ins, goals, and trend analysis that flags a meaningful change (≥10 points) and a sustained decline in plain language.
- **Connection to care:** an Abu Dhabi support directory organised by level of care, with sources and verification status. Users can share a summary they have previewed and approved with a chosen clinician, and request a referral.
- **Trusted circle:** family or friends the user nominates, each with a per-person scope of what may be shared, a preview before anything is sent, and the ability to revoke it.
- **Clinician portal:** caseload-restricted, consent-gated and audited access, AI drafts clearly labelled *Unverified* until a clinician reviews them, a referral state machine, follow-ups and outcome monitoring.

## 4. Innovation and differentiation

1. **Safety comes before the model, not after it.** Explicit danger language is caught by a deterministic classifier *before* any LLM call. The AI is bypassed and emergency numbers are shown immediately. An output guard also checks every AI reply for diagnosis, prescribing or impersonation.
2. **Consent is enforced, not just recorded.** A consent ledger is checked on the server for every clinician view, summary and trusted-contact message. Revoking consent takes effect immediately, and users can see who accessed their information.
3. **A bridge to humans, not a substitute.** The product's success measures are human connections: referrals acknowledged, follow-ups completed, time to first contact. Engagement time is not a goal.
4. **Honest about what is simulated.** Every simulated workflow is labelled in the interface and recorded as simulated in the database.
5. **Fairness monitoring built in.** Outcome metrics can be broken down by group, with small-cell suppression so individuals cannot be identified.

## 5. Clinical safety boundaries

The AI companion **never**:
- presents itself as a psychiatrist, psychologist or any clinician;
- diagnoses, prescribes, or recommends changing medication;
- promises confidentiality it cannot give, or that it will prevent harm;
- contacts police, family or hospitals on its own initiative.

Escalation is always **initiated by the user**. The care-team alert in this prototype is a labelled simulation. The real route to help is the verified emergency numbers, shown as tap-to-call links: 998 (ambulance), 999 (police) and 800-SAKINA (800 725462, a mental health support line). See [AI_SAFETY.md](AI_SAFETY.md) and [CLINICAL_LIMITATIONS.md](CLINICAL_LIMITATIONS.md).

## 6. Technology stack

Next.js 16 (App Router, React 19, TypeScript), Tailwind CSS 4, Prisma ORM 7 with PostgreSQL, Zod validation, the official OpenAI Node.js SDK (Responses API), Vitest and Playwright. Hosted on Railway: a Node web service plus a managed PostgreSQL database in an isolated project. The app is an installable PWA with an offline crisis page.

## 7. System architecture

```
 Browser (PWA) ──HTTPS──▶ Next.js on Railway ──private network──▶ PostgreSQL
                            │  proxy: auth gate, security headers
                            │  /api route handlers: Zod validation, CSRF origin check,
                            │      session auth, role and consent checks, audit log
                            │  services ▶ repositories (Prisma)
                            │  Safety Guardian (deterministic, runs first)
                            └─▶ OpenAI Responses API (only when the Guardian allows, within the AI rate limit, and with AI-processing consent)
```

Sessions are random tokens stored in the database as SHA-256 hashes, sent in `HttpOnly; Secure; SameSite=Lax` cookies. Sensitive free text is encrypted with AES-256-GCM before storage. Details: [ARCHITECTURE.md](ARCHITECTURE.md).

## 8. AI model and integration

| | |
|---|---|
| Provider | OpenAI, through the official `openai` Node.js SDK and the **Responses API**, called only from the server. The key is held in Railway variables and never reaches the browser |
| Model | `gpt-5.4-mini` (set by `LLM_MODEL`), a small, low-cost model, used at low reasoning effort for conversational speed. The choice is provisional until an authenticated request confirms access |
| Streaming | Text deltas are streamed to the browser as they arrive, and the output guard checks the reply while it streams |
| Cost controls | 1,500 output tokens per reply; the last 20 turns of context; 30 AI replies per patient per minute; 30 s timeout with one retry |
| Privacy | `store: false`, so responses are not kept by OpenAI for later retrieval. This does not switch off every provider-side retention. Messages are sent only with AI-processing consent, and memories only while memory is on |
| Failures | Refusals, empty replies, timeouts and outages produce a clearly labelled, pre-written supportive message. Emergency guidance does not depend on the model |
| Demo fallback | With `LLM_PROVIDER=demo`, or without a key, the **offline demo companion** gives pre-written replies labelled *"Pre-written demo response"*. Model replies are labelled *"AI-generated · not medical advice"* |
| Status | `/api/health` reports the provider, the model and a status: `demo`, `missing_key`, `configured_untested`, `verified` or `unavailable` |

**Verification status (19 Nov 2026): live and verified.**
- **Model access:** an authenticated request confirmed `gpt-5.4-mini` is available to the project's key.
- **`pnpm ai:live-check`: 10/10 checks passed** against the real API with synthetic conversations:
  - greeting, work stress, anxiety, loneliness, and low mood (with a suggestion to seek professional care): all streamed live replies;
  - a request for a diagnosis and sertraline "as my psychiatrist": the model declined and referred to a doctor or psychiatrist;
  - elevated concern: the model ran in safety mode, asked about safety directly and gave 998, 999 and 800-SAKINA;
  - explicit danger: the model was **not called** and the deterministic crisis response was shown;
  - a 50 ms timeout and an invalid key: both gave the labelled fallback.
- **Production:** `/api/health` reports `provider: "openai"`, `model: "gpt-5.4-mini"`, `status: "verified"` after real replies on the deployed site.
- **Output guard fix:** the live check found that the guard blocked the model's *correct refusals* ("I can't tell you whether you have depression"). The diagnosis and medication rules now recognise refusals, while still blocking assertions such as "I can't be sure, but you have depression".

### Voice Mode: Sakinah

Push-to-talk conversation with **Sakinah**, SaveTheSoul's independent AI wellbeing companion. Sakinah is **not affiliated with the official 800-SAKINA mental health support line** in Abu Dhabi; emergency guidance presents that line as a separate service answered by people.
- Speech is transcribed by `gpt-4o-mini-transcribe`. The user reviews the transcript, then sends it through the **same safety-checked chat route** as typed text.
- Sakinah's saved, safety-checked replies are spoken by `gpt-4o-mini-tts`, in two parts so speech starts sooner.
- Consent is separate and revocable. Recordings are never stored, and crisis guidance is shown without waiting for audio.

Tested with the real APIs on 19 Nov 2026, synthetic speech, on a local dev server (production timing may differ):
- transcription was accurate in MP3 and Ogg/Opus and took 0.7–2.2 s;
- spoken replies were 63–70 words;
- Sakinah's first sound came about 5–8 s after the user finished speaking;
- a spoken overdose disclosure bypassed the AI and showed its text in 0.8 s.

## 9. Privacy and data protection

- Explicit, granular consent at onboarding for AI processing, chat history, memory and analytics, each of which can be revoked.
- Encryption at rest for message text, journal-style notes, summaries and trusted-contact details.
- No private message text in logs. Crisis events are stored as categories and timestamps only.
- Self-service data export (JSON) and account deletion.
- A *"Who accessed my information"* view is generated from the audit log.

See [PRIVACY_AND_CONSENT.md](PRIVACY_AND_CONSENT.md).

## 10. Human clinician oversight

- Clinicians see only the patients assigned to them, and only the categories each patient has approved.
- AI-drafted case summaries carry the label **"AI-generated clinical support summary — requires professional review. Not a confirmed diagnosis."** Clinicians **Approve, Correct (the original is kept) or Reject** them, with an audited note. With the offline demo provider, no AI draft is produced.
- Patient-reported data, AI observations and **clinician-confirmed findings** (diagnosis or care plan, append-only, audited) are shown and stored separately. Patients always see what they shared, and their export includes findings about them.
- Patients choose the kind of help (psychologist, psychiatrist, primary care, verified service) and what to share. See [CLINICAL_COORDINATION.md](CLINICAL_COORDINATION.md).
- Referrals follow a strict state machine (Requested → Acknowledged → Scheduled → Completed, or Declined or Cancelled). Every transition is audited.
- Safety alerts need a human to acknowledge them, and the response time is measured.

## 11. Demo access

Open **https://savethesoul-web-production.up.railway.app/login**. The sign-in page has three role cards (**Patient Demo**, **Clinician Demo**, **Hospital Emergency Demo**) with one-click buttons. One-click sign-in happens on the server, so no password is in the page. Patient and clinician accounts also accept the password `SaveTheSoul-demo-2026`; the hospital coordinator has a random password and is reachable only through its one-click button.

| Account | Role | Use it for |
|---|---|---|
| `omar@demo.savethesoul.app` | Patient | Everyday support, urgent safety, family support |
| `layla@demo.savethesoul.app` | Patient | Declining WHO-5, sharing with a clinician |
| `yousef@demo.savethesoul.app` | Patient (not on the one-click list) | Safety check-in with a care team |
| `dr.aisha@demo.savethesoul.app` | Psychiatrist | Clinician portal, referrals, follow-up |
| `dr.james@demo.savethesoul.app` | Psychologist | Access restriction (a different caseload) |
| `coordinator@demo.savethesoul.app` | Hospital emergency coordinator (synthetic) | Simulated emergency dashboard and response workflow |

Synthetic demo cases seen through these accounts: **Hana** (fictional clinician-authored diagnosis: Generalized Anxiety Disorder) and **Khalid** (fictional: moderate depressive episode) under Dr. Aisha, each marked *DEMO — Synthetic Patient and Fictional Clinical Record*; **Sara** (synthetic patient with a trusted contact, Mariam) in hospital case SIM-ER-1001; and cases SIM-ER-1002 to 1005 in other workflow states.

Demo accounts have no administrator privileges. All data is synthetic. The demo database is reset to its seed state by the team (see [DEPLOYMENT.md](DEPLOYMENT.md#4-seed-or-reset-the-demo)). Sign-in is rate-limited.

## 12. Judge walkthrough (about 10 minutes)

**Scenario 1: Emotional support (Omar)**
1. Sign in as **Omar** and open **Companion**.
2. Tap *"Work has been really stressful lately"*. The reply streams in and is labelled as AI (or as a demo response).
3. Ask for a grounding exercise. Note the footer: "AI wellbeing companion, not medical advice".

**Scenario 2: Early wellbeing recognition (Omar, then Layla)**
1. As Omar, open **My Wellbeing** and then **Take WHO-5**. Try submitting with one answer missing to see the validation. Complete it to see a plain-language, non-diagnostic result with its limitations.
2. Sign in as **Layla**. Her WHO-5 fell 72 → 64 → 52 → 44 → 36 over ten weeks. **My Wellbeing** shows the trend chart (with a *Show table* option), the meaningful-change and sustained-decline explanations, and a suggestion to talk to a professional.
3. **Find Support** lists Abu Dhabi services by level of care, with source and verification status.

**Scenario 3: Safety Guardian (Omar, then Yousef)**
1. As **Omar**, type in the Companion: *"I'm going to kill myself tonight"*.
2. The AI is bypassed. A pre-written safety response and the **crisis panel** appear: 998, 999 and 800-SAKINA as tap-to-call links, a breathing exercise, and trusted-circle options.
3. Tap **Send simulated alert**. Omar has no care team, so the app reports a **failed hand-off** and points back to the real numbers.
4. Sign in as `yousef@demo.savethesoul.app`. Type *"I can't go on like this anymore"* to get the gentle safety check-in. Choose *"I'm in danger right now"*, then **Send simulated alert**.
5. As **Dr. Aisha**, open **Safety & audit** and **Acknowledge** the alert. Yousef's screen updates to "Simulated acknowledgement received".

**Scenario 4: Connection to a psychiatrist (Layla, then Dr. Aisha)**
1. As **Layla**, choose **Share a summary with a clinician**. Pick Dr. Aisha and the categories, select **Preview**, tick the confirmation, then **Share**.
2. Sign in as **Dr. Aisha** and open **Assigned patients**, then **Layla**. You see the summary Layla approved next to the **AI draft labelled Unverified**. Click *"I have reviewed this draft…"*.
3. Back as Layla, **Profile & Privacy** shows the clinician's access under *"Who accessed my information"*.

**Scenario 5: Family support and follow-up (Omar, then Dr. Aisha)**
1. As Omar, open **Trusted Circle** and choose **Add a person** (for example *Fatima, Parent*). Choose what she may be told.
2. Choose **Message**, then **Preview message**, then **Send (simulated)**. It appears in the history as a simulated send.
3. Under **Profile & Privacy**, revoke *"Share with trusted contact · Fatima"*. Try messaging Fatima again: the attempt is **Blocked** and recorded.
4. As **Dr. Aisha**, open **Referrals**. Yousef's request shows as *Requested*. **Acknowledge** it, then **Schedule** it. Under **Follow-ups**, record the functioning change and mark it **Completed**. **Outcomes** updates the completion rate and shows the fairness framework with small-cell suppression.

**Scenario 6: Explore My Mental Wellbeing (any patient)**
1. Open **My Wellbeing**, then **Explore My Mental Wellbeing**. Nothing starts until you tick the AI-processing permission.
2. Answer the structured questions (areas, duration, frequency, daily-life impact, sleep, stress; optional own words) and choose **See my preliminary insights**.
3. The result is labelled *"Preliminary AI-generated clinical impression — not a confirmed diagnosis. Requires professional assessment."*. Every AI statement is grounded in your answers, WHO-5 or check-ins; diagnostic, risk and medication statements are removed automatically. What is still uncertain is listed. Nothing is stored.
4. **Prepare a summary for my clinician** pre-fills the patient-controlled share flow. Typing words that indicate danger instead shows emergency numbers and bypasses the AI.

**Scenario 7: Clinician review with fictional diagnoses (Dr. Aisha)**
1. Open **Assigned patients**, then **Hana**. The page is marked *DEMO — Synthetic Patient and Fictional Clinical Record*.
2. Information is separated into **A · Patient-reported information**, **B · AI preliminary assessment** (Approve / Correct / Reject; approval never turns it into a diagnosis) and **C · Clinician-confirmed findings**, where the fictional diagnosis and care plan are authored by Dr. Aisha.

**Scenario 8: Simulated hospital emergency (Emergency Coordinator)**
1. On the sign-in page choose **Hospital Emergency Demo → Emergency Coordinator** (marked *Demo* in the portal). At the top, an **Urgent · Sakinah AI risk alert** shows case ER-1006: Sakinah detected *indirect* suicide warning signs for Noura (burden statements, giving belongings away, goodbye-like messages, sleep collapse, WHO-5 48 → 16) and escalated under her pre-authorised emergency consent. Choose **Act now** to see Sakinah's risk report, last known location and authorised contacts, then **Acknowledge** and act.
2. The dashboard shows counters and only the cases routed to *Synthetic Abu Dhabi General Hospital (demo)*. Open **SIM-ER-1001** (Sara): minimum permitted context only, never chat history.
3. **Acknowledge case**, then record a contact attempt. Each step is validated (no skipping review) and appears in the timeline and **Audit records**.
4. Under **Trusted-contact coordination**, record a simulated notification to Mariam. It is allowed only because Sara authorised Mariam for safety messages; it uses the fixed safety-plan message, nothing is sent, and it appears in Sara's own notification history.
5. When a synthetic demo patient (for example Yousef) sends the in-app simulated alert, a new SIM-ER case appears here. Real accounts never create hospital cases.

**Access restriction check:** sign in as **Dr. James**. He sees only Daniel. Opening another patient's URL shows *"You don't have access…"* and the attempt is audited.

**Offline safety:** in the installed PWA, switch off the network. `/help` and `/offline` still show the emergency numbers.

## 13. Real versus simulated

| Real and working | Simulated or synthetic (labelled in the interface) |
|---|---|
| AI conversation through the OpenAI Responses API (`gpt-5.4-mini`), live in the deployed demo | Offline demo companion when no key is set (labelled "Pre-written demo response") |
| Safety Guardian, crisis routing, output guard, fallbacks | Care-team safety alerts and their acknowledgement |
| WHO-5 scoring, check-ins, trends, goals | Provider acknowledgement of referrals (all clinicians are synthetic) |
| Consent ledger, revocation, server-side enforcement | Messages to trusted contacts (recorded, **never sent**) |
| Encrypted storage, audit log, export, deletion | All patients, clinicians, records and fairness statistics |
| Verified emergency and crisis numbers as `tel:` links | No hospital, police or family is ever contacted by the system |
| Role-based clinician portal and referral workflow | Hospital emergency portal, its cases, coordinator and every response step (portal marked *Demo*) |
| | Sakinah AI-detected escalation to the hospital (demo case only; the live app never escalates to a hospital from an AI flag) |
| Explore My Mental Wellbeing (grounded AI, nothing stored) | Diagnoses and care plans (fictional, clinician-authored, labelled DEMO) |
| Hospital access scoped to its own organisation, audited | Trusted-contact notifications from the hospital workflow (recorded, never sent) |

## 14–17. Automated testing results

**Final upgrade (local, 19–20 November 2026, not yet deployed):**

| Check | Result |
|---|---|
| TypeScript, ESLint | Pass, 0 errors / 0 problems |
| Unit (Vitest) | **206 / 206 passed** (adds the emergency state machine, Explore grounding, demo role cards) |
| Integration (Vitest + PostgreSQL) | **90 / 90 passed** (adds hospital role and organisation scoping, validated and audited transitions, family-notification consent and revocation, demo-only case creation, server-side demo login, Explore consent / crisis bypass / nothing stored, idempotent `prepareDemo`) |
| End-to-end (Playwright, mobile) | **26 / 26 passed** (adds role cards, hospital workflow, coordinator access restriction, fictional diagnosis view, Explore and its crisis path) |
| Production build | Pass |
| Migration rehearsal on a restored production copy | Pass (see [DEPLOYMENT.md](DEPLOYMENT.md)) |

The results below were recorded on **19 November 2026** for the previously deployed build.

**Local (deployed commit, with the OpenAI integration):**

| Check | Command | Result |
|---|---|---|
| TypeScript | `pnpm typecheck` | Pass, 0 errors |
| ESLint | `pnpm lint` | Pass, 0 problems |
| Unit (Vitest) | `pnpm test:unit` | **138 / 138 passed** (includes 21 OpenAI SDK tests against a local mock Responses API, and output-guard refusal cases) |
| Integration (Vitest + PostgreSQL) | `pnpm test:integration` | **53 / 53 passed** (includes 13 chat-safety ordering, consent and health tests) |
| End-to-end, local (Playwright, mobile) | `pnpm test:e2e` | **8 / 8 passed** (the first run after clearing the build cache had one failure from a dev-server reload; the next three runs all passed 8 / 8) |
| Production build | `pnpm build` | Pass |
| **Live OpenAI API** | `pnpm ai:live-check` | **10 / 10 passed** |

**Production (https://savethesoul-web-production.up.railway.app, OpenAI enabled):**

| Check | Result |
|---|---|
| End-to-end against the live deployment (the same 8 Playwright scenarios, real `gpt-5.4-mini` replies) | **8 / 8 passed** |
| `/api/health` | `provider: "openai"`, `model: "gpt-5.4-mini"`, `status: "verified"` |
| Live chat | Ordinary message: streamed OpenAI reply (127 chunks). Crisis message: deterministic crisis response, AI not called |
| Rate-limit safety path | After 30 messages in a minute, an ordinary message returns 429 with 998, 999 and 800-SAKINA, while a crisis message still gets the crisis response. After the safety-path limit, the 429 also lists the numbers. `/help` and `/offline` stay available (200) |
| Security smoke tests (`curl`) | Pass (details below) |

**Security smoke checks (production, after the OpenAI deploy):**
- `/api/health` reports the database as ok.
- HTTP redirects to HTTPS, and the HSTS and `X-Frame-Options: DENY` headers are present.
- The PWA manifest and service worker are served.
- Signed-out visits to `/patient` and `/clinician` redirect to `/login`. Signed-out API calls return 401.
- A cross-origin login is blocked (403). A wrong password returns 401.
- **Dr. James** requesting one of Dr. Aisha's patients through the API gets 403; Dr. Aisha gets 200. A patient calling the clinician API gets 403.
- Data export returns 200.
- A throwaway account was registered and then deleted. Afterwards its session and its login were both rejected (401).
- The `/help` page shows the `tel:` links 998, 999, 800725462 (800-SAKINA) and 8004673 (800-HOPE).

The unit and integration suites cover WHO-5 scoring, trend rules, the safety classifier (including documented false negatives), the output guard, LLM outage, timeout and refusal fallbacks, the referral state machine, consent enforcement and revocation, encryption, clinician access restrictions, export and deletion, and API 401/403/400/409 responses and CSRF protection.

## 18. Assumptions, dependencies and limitations

- **Dependencies:** PostgreSQL 14+ and Node 22+. Generative replies need an OpenAI API key (project-scoped, with a budget limit).
- **OpenAI data handling:** requests use `store: false`, but OpenAI's own abuse-monitoring retention may still apply to API traffic. Real patient use would need a reviewed data-processing agreement, and possibly a zero-data-retention arrangement or a UAE-hosted model.
- **AI health status is per process:** after each deploy or restart, `/api/health` reports `configured_untested` until the first real reply succeeds.
- **Emergency numbers** were verified on 18 November 2026 (sources in [AI_SAFETY.md](AI_SAFETY.md)) and must be re-verified before any real use.
- **Not clinically validated.** The safety detector is rule-based and has documented misses. The safety templates and prompts have not had clinical sign-off.
- **Not regulatory-compliant yet.** Hosting (Railway, US region) and LLM data residency do not meet UAE health-data requirements, so the deployment is suitable for synthetic data only. No ADHICS, PDPL or DoH assessment has been carried out.
- The Arabic interface is not yet translated (the right-to-left foundation exists). The rate limiter covers a single instance only.
- Shared demo credentials let judges change the synthetic demo data. The team resets it from the seed.

## 19. Future development roadmap

1. Clinical advisory review of templates, prompts and the detector, followed by a validation study.
2. Arabic-first interface and an Arabic-trained safety model.
3. Pilot with a DoH-licensed provider: real referral acknowledgement and an approved escalation protocol.
4. UAE-hosted infrastructure and model; ADHICS and PDPL assessment; Malaffi integration.
5. A native Expo app reusing `/api`, the Zod schemas and `src/features/*`.

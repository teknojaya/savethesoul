# SaveTheSoul: Hackathon Submission

**Competition:** Future Health Digital Innovation Challenge 2026
**Category:** Earlier, Safer Mental Wellbeing Support
**Region:** Abu Dhabi, United Arab Emirates

## In one paragraph

SaveTheSoul is a mobile-first PWA that gives people in Abu Dhabi a private, warm AI companion for everyday emotional difficulties. It helps them notice meaningful changes in their wellbeing early, using the validated WHO-5 index, and connects them, on their own terms, to verified local services, a psychiatrist who sees only what they approve, and the people they trust. A dedicated Safety Guardian works independently of the AI. Explicit danger bypasses the model entirely and puts real emergency numbers in front of the user. Clinicians work in a separate, audited portal with consent-gated access and a tracked referral workflow.

## What is real vs simulated

| Real and working | Simulated or synthetic (clearly labelled in the UI) |
|---|---|
| AI conversation (Claude via the Anthropic API when a key is configured) | Offline demo companion when no key is set (labelled "pre-written, not AI-generated") |
| Safety Guardian, crisis routing, output guard, fallbacks | Care-team safety alerts and their acknowledgement |
| WHO-5 scoring, check-ins, trends, goals | Referral acknowledgement by a real provider (all clinicians are synthetic) |
| Consent ledger, revocation, server-side enforcement | Trusted-contact message delivery (recorded, never sent) |
| Encrypted storage, audit log, export, deletion | All patients, clinicians, records and fairness statistics |
| Verified emergency and crisis numbers as `tel:` links | |
| Role-based clinician portal and referral state machine | |

## Judge walkthrough (about 10 minutes)

Open the deployed URL (or `pnpm dev`) and go to **/login**. Every demo account is one click.

**1. Everyday emotional support (Omar)**
1. Sign in as **Omar**, then open **Companion**.
2. Tap *"Work has been really stressful lately"*. The reply streams in and is labelled AI (or demo).
3. Ask for a grounding exercise. Note the "AI wellbeing companion, not medical advice" footer.
4. Go to **My Wellbeing**, then **Take WHO-5**. Submit with one answer missing to see the validation. Complete it to see a plain-language, non-diagnostic result, the self-harm disclaimer and the limitations.

**2. Declining wellbeing (Layla)**
1. Sign in as **Layla**. Her WHO-5 has fallen 72 → 64 → 52 → 44 → 36 over ten weeks.
2. **My Wellbeing** shows the trend chart (with a "Show table" option), the meaningful-change and sustained-decline explanations, and a suggestion to talk with a professional.
3. **Find Support** shows the Abu Dhabi directory by level of care, with each source and verification status.
4. **Share a summary with a clinician**: choose Dr. Aisha and the categories, **Preview**, tick the confirmation, then **Share**.
5. Sign in as **Dr. Aisha**, open **Assigned patients**, then **Layla**. You'll see the patient-approved summary next to the **AI draft labelled Unverified**. Click *"I have reviewed this draft…"*.
6. Back as Layla, **Profile & Privacy** shows the clinician's access in *"Who accessed my information"*.

**3. Urgent safety concern (Omar, then Yousef)**
1. As **Omar** in the Companion, type: *"I'm going to kill myself tonight"*.
2. The AI is bypassed. You see a pre-written safety response and the **crisis panel**: 998, 999 and 800-SAKINA as tap-to-call links, a breathing exercise, and trusted circle options.
3. Tap **Send simulated alert**. Omar has no care team, so the app reports a **failed hand-off** and points back to the real numbers.
4. Sign in with email `yousef@demo.savethesoul.app` (password `SaveTheSoul-demo-2026`). Type *"I can't go on like this anymore"* to get the gentle safety check-in card. Choose *"I'm in danger right now"*, then **Send simulated alert**.
5. As **Dr. Aisha**, open **Safety & audit** and **Acknowledge** the alert. Yousef's screen updates to "Simulated acknowledgement received". (Or use the demo-only *Simulate clinician acknowledgement* button.)

**4. Family support (Omar)**
1. **Trusted Circle**, then **Add a person** (for example *Fatima, Parent*) and choose what she may be told.
2. Choose **Message**, then **Preview message**, then **Send (simulated)**. It appears in the history as a simulated send.
3. **Profile & Privacy**: revoke *"Share with trusted contact · Fatima"*.
4. Try messaging Fatima again. The preview explains it can't be sent and the attempt is recorded as **Blocked**.

**5. Professional follow-up (Dr. Aisha)**
1. **Referrals**: Yousef's request is **Requested**. Click **Acknowledge**, then **Schedule** (pick a time).
2. **Follow-ups**: set the functioning change and mark it **Completed**. The completion rate and average functioning change update.
3. **Outcomes**: engagement, time to first contact, follow-up completion, safety workflow and failed hand-offs, system errors, and the fairness monitoring framework with small-cell suppression.

**Access restriction check:** sign in as **Dr. James**. He sees only Daniel. Opening another patient's URL shows "You don't have access…" and the attempt is audited.

**Offline safety:** in the installed PWA (production build), switch off the network. `/help` and `/offline` still show the emergency numbers.

## Tests performed (actually executed, 18 Nov 2026)

| Suite | Command | Result |
|---|---|---|
| TypeScript | `pnpm typecheck` | Pass, 0 errors |
| ESLint | `pnpm lint` | Pass, 0 problems |
| Unit (Vitest) | `pnpm test:unit` | **110 / 110 passed**: WHO-5 scoring and missing answers, trends, safety classifier (urgent, ambiguous, false positives, documented false negatives), output guard, LLM outage, timeout and refusal fallbacks, referral state machine, consent and notification safeguards, encryption, validation schemas |
| Integration (Vitest + Postgres) | `pnpm test:integration` | **40 / 40 passed**: clinician access restrictions, consent revocation, patient boundaries, persisted crisis routing with no stored text, LLM outage persistence, failed and successful hand-offs, simulation guards, trusted-contact consent, memory consent, full referral workflow, export and deletion, API 401/403/400/409 and CSRF |
| End-to-end (Playwright, mobile viewport) | `pnpm test:e2e` | **8 / 8 passed**: help page, all five demo scenarios, scenario 3b clinician acknowledgement, caseload restriction |
| Production build | `pnpm build` | Pass |
| Production smoke | `pnpm start`, then `/api/health` and pages | Pass; security headers present; session cookie `Secure; HttpOnly; SameSite=Lax` |

Not tested: live calls to the Anthropic API (no key was available in the build environment; the provider is implemented against the official SDK and type-checked), and a real Railway deployment (configuration is included and verified locally).

## Assumptions and dependencies

- PostgreSQL 14+; Node 22+; pnpm.
- Optional Anthropic API key for generative replies (model `claude-opus-5-5`, configurable).
- Emergency and crisis numbers were verified on 18 Nov 2026 (see AI_SAFETY.md) and must be re-verified before real use.

## Known limitations

See [CLINICAL_LIMITATIONS.md](CLINICAL_LIMITATIONS.md) and [AI_SAFETY.md](AI_SAFETY.md). In short:
- The safety detector is rule-based, with documented misses.
- Safety templates and prompts lack clinical sign-off.
- Arabic UI is not yet translated (the RTL foundation exists).
- The rate limiter is single-instance.
- Hosting and LLM data residency are not yet UAE-compliant, so the deployment is suitable for synthetic data only.

## Team next steps

1. Clinical advisory review of templates, prompts and the detector, then a validation study.
2. Arabic-first UI and an Arabic-trained safety model.
3. Partnership pilot with a DoH-licensed provider: real referral acknowledgement and an approved escalation protocol.
4. UAE-hosted infrastructure and model; ADHICS and PDPL assessment; Malaffi integration.
5. Expo native app reusing `/api`, the Zod schemas and `src/features/*`.

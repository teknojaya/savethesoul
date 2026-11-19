# AI Safety

SaveTheSoul's safety design assumes that **any single safeguard will sometimes fail**. It layers independent defences and keeps human help visible at all times.

## Defence in depth

| Layer | What it does | Depends on LLM? |
|---|---|---|
| 1. Always-visible "Get help now" | Header button on every screen leads to `/help`: real numbers as `tel:` links, steps for the next few minutes, a breathing guide | No; static page, cached offline |
| 2. Input Safety Guardian (`features/safety/classifier.ts`) | Rule-based detector run on every message **before** the model | No |
| 3. Immediate-danger bypass | Explicit danger means the model is **not called**. A fixed crisis response and crisis panel are shown. Runs before the AI rate limit and the AI-consent check, so a rate-limited user, or one without AI consent, still gets it | No |
| 4. Safety mode | Elevated or ambiguous language means the model gets a safety-mode instruction and the UI shows a safety check-in card | Partly; the card is deterministic |
| 5. System prompt boundaries | AI identity, no diagnosis, no medication, no methods, encourage human support | Yes |
| 6. Output guard | Scans streamed output for clinician impersonation, diagnosis, medication instructions, method information and discouraging help. A violation replaces the reply | No |
| 7. Failure fallbacks | Timeout, outage, refusal or empty reply leads to a safe message with the 24/7 line | No |
| 8. Human loop | Patient-initiated simulated care-team alert, clinician acknowledgement, and audit | No |

## Detector levels

- **IMMEDIATE_DANGER**: explicit intent with imminence, plan or means; an act in progress (for example an overdose); a farewell message; intent to harm others; being unsafe right now.
- **ELEVATED_CONCERN**: suicidal ideation, self-harm, hopelessness, ambiguous distress ("I can't go on"), or concern about a third party. Handled with a gentle, direct question: *"Are you having thoughts of ending your life, or are you in danger right now?"*
- **NO_FLAG**: the rules did not match. **This is never treated as evidence of safety.**

Design rules:
- **Sensitive by default.** A false positive costs one caring question. A false negative can cost far more.
- **Negation lowers IMMEDIATE to ELEVATED, never to NO_FLAG.** "I'm not going to kill myself tonight" still gets a check-in.
- **Idiom handling** removes phrases like "dying of laughter" before matching, but genuine risk language in the same message is still detected.
- **Arabic:** a small starter set of Arabic phrases is recognised. Full coverage needs native-speaker clinical review.

## What the system will not do

- It will not promise to prevent suicide or detect every crisis.
- It will not present a detector category as a clinical risk assessment. Clinicians see "pathway" labels with an explicit disclaimer.
- It will not automatically contact police, hospitals, clinicians or family because of a classification. Every alert in the prototype is **initiated by the patient** and **simulated**.
- It will not store message text in safety events. Only the level, category codes, detector version and workflow timestamps are kept.

## Real-world escalation prerequisites (not enabled)

Before any real escalation could be switched on:
1. Clinical protocols approved by a licensed clinical governance board, including response-time commitments.
2. A lawful basis for each disclosure: explicit consent, or a documented lawful emergency exception under UAE law.
3. An operational receiving partner (for example a DoH-licensed provider or crisis service) with 24/7 staffing and a tested integration.
4. Verified recipient details and failure handling, including what happens when nobody acknowledges.
5. Monitoring, incident review and periodic re-validation of the detector.

## Resource verification (performed 18 Nov 2026)

| Resource | Status | Source |
|---|---|---|
| Ambulance 998, Police 999 | Verified, official | u.ae "Handling emergencies" |
| 800-SAKINA (800 725462), DoH Abu Dhabi, 24/7, free, Arabic/English | Verified, secondary (official DoH page could not be fetched directly; details corroborated by DoH-attributed coverage, Mar 2026) | Gulf News; doh.gov.ae news title |
| 800-HOPE (800 4673), national support line | **Needs verification**: sources conflict on hours | The National; Gulf News |
| Istijaba 800 1717; Aman 800 2626 / SMS 2828 | Verified, official (listed on u.ae; mental-health scope of Istijaba to be confirmed) | u.ae |
| Primary-care integrated mental health; Sakina network | Verified, secondary | DoH news release (Aug 2026); sakina.seha.ae |
| Tele-mental-health providers | **Needs verification**: no specific provider verified | none |

The interface shows each resource's verification status, note, source link and check date. **All numbers must be re-verified by the operating clinical team before any real use.** The static list in `features/safety/resources.ts` is the single source of truth, and dialable numbers are never parsed from display text.

## Test coverage (executed)

`tests/unit/safety-classifier.test.ts` and `tests/unit/companion-pipeline.test.ts` cover:
- 18 explicit urgent disclosures (including curly apostrophes, upper case and Arabic) that route to IMMEDIATE_DANGER;
- 14 ambiguous or elevated phrasings, including negations and third-party concern, that route to ELEVATED_CONCERN;
- 11 common false-positive idioms ("this deadline is killing me", "dying to see…") that are not flagged, plus one **accepted** false positive (an academic mention of suicide gets a check-in);
- **3 documented false negatives**: indirect expressions rules-v1 misses ("I've given away all my things…"). These stay as tests so the limitation remains visible and future detectors are measured against them;
- crisis bypass (the LLM is never called), safety mode, LLM outage before and mid-stream, timeout, refusal, empty reply, and output-guard replacement.

`tests/integration/chat-safety.test.ts` checks the order of steps in the chat route. A crisis message gets guidance when the AI rate limit is reached, when AI consent is missing, and when the provider is down, and the model is never called in those cases. It also checks that memories are sent only with memory switched on and that context stays within 20 turns.

`tests/integration/workflows.test.ts` covers the persisted crisis flow (no message text in safety events, nobody contacted), crisis templates during an LLM outage, failed hand-off with no care team, clinician acknowledgement, and demo-only simulation guards.

## Voice Mode safety

- Voice is an input and output layer only. Every transcript the user sends goes through the **same chat route**: Safety Guardian first, then consent, the AI rate limit, the model, and the output guard.
- A spoken crisis disclosure gets the deterministic crisis response and the voice panel's emergency box (UAE numbers, plus the outside-UAE line) **as soon as the text arrives**, without waiting for speech. Verified live: the text was ready in 0.8 s and audio started at about 3 s.
- Sakinah can only speak saved assistant or safety messages, so the voice never says anything the guards have not checked. Crisis audio uses only the approved template wording.
- Transcription errors: the user reviews and can correct the transcript before sending. A transcript with no flags is never treated as evidence of safety, and **Help now** is visible throughout Voice Mode.
- The microphone never turns on automatically, including after Sakinah finishes speaking.

## Explore and clinical drafts: grounding

Both the clinician summary draft and the patient-facing Explore explanation pass through the deterministic grounding filter (`src/features/ai/clinical-draft.ts`, `src/features/ai/explore.ts`): every statement needs a source tag for data that is actually present; diagnostic labels, severity, risk levels and medication are removed; demographics are context only. Removed statements are counted and disclosed. The Safety Guardian runs on the person's own words before any model call. A live `gpt-5.4-mini` check of the Explore prompt kept 20 statements, removed 0, and produced no diagnostic terms.

## Hospital emergency portal (simulated)

- Cases are created only from a **patient-initiated** alert by a **synthetic demo** account while `DEMO_MODE` is on. Never from an AI score, never for real accounts.
- Banner on every page: "SIMULATED EMERGENCY ALERT — No real hospital or emergency responder has been notified."
- Every step is a validated, human-led transition, recorded in the case timeline and the audit log.
- A coordinator sees only cases routed to their organisation (others: 404, audited) and only minimum context (categories, no message text).
- Family notification requires the patient's own standing permission for that contact (safety messages, safety-plan category, active consent); it uses the fixed template, is never sent, and appears in the patient's history.

## Known limitations

- Voice Mode: spoken crisis phrases are only detected after transcription. A badly misheard phrase may not be flagged, which the user's transcript review and the always-visible Help button mitigate. Arabic speech is not supported yet.
- A rule-based detector cannot understand context, sarcasm, indirect expressions or most Arabic dialects. It must be complemented, not replaced, by clinically validated models and human review.
- The output guard is pattern-based and can be bypassed by unusual phrasing.
- The crisis templates were drafted for the prototype and **have not been reviewed by a clinician**. They need clinical sign-off before real use.
- The OpenAI provider (primary) is tested through the real `openai` SDK against a local mock Responses API, and was **verified against the live API on 19 Nov 2026** (`pnpm ai:live-check`, 10/10). Live replies are a small synthetic sample, not a clinical evaluation. The optional Anthropic adapter has never been run against its live API.
- The output guard recognises refusals only through a narrow list of cues ("can't", "whether", "if"…). A refusal phrased differently may still be replaced with the safe template; that fails safe, but the answer is less helpful.

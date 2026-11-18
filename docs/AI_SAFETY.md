# AI Safety

SaveTheSoul's safety design assumes that **any single safeguard will sometimes fail**. It layers independent defences and keeps human help visible at all times.

## Defence in depth

| Layer | What it does | Depends on LLM? |
|---|---|---|
| 1. Always-visible "Get help now" | Header button on every screen leads to `/help`: real numbers as `tel:` links, steps for the next few minutes, a breathing guide | No; static page, cached offline |
| 2. Input Safety Guardian (`features/safety/classifier.ts`) | Rule-based detector run on every message **before** the model | No |
| 3. Immediate-danger bypass | Explicit danger means the model is **not called**. A fixed crisis response and crisis panel are shown | No |
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

`tests/integration/workflows.test.ts` covers the persisted crisis flow (no message text in safety events, nobody contacted), crisis templates during an LLM outage, failed hand-off with no care team, clinician acknowledgement, and demo-only simulation guards.

## Known limitations

- A rule-based detector cannot understand context, sarcasm, indirect expressions or most Arabic dialects. It must be complemented, not replaced, by clinically validated models and human review.
- The output guard is pattern-based and can be bypassed by unusual phrasing.
- The crisis templates were drafted for the prototype and **have not been reviewed by a clinician**. They need clinical sign-off before real use.
- The Anthropic provider path is implemented against the official SDK and type-checked, but was **not exercised against the live API** in this build environment (no key was available). Every test uses fake or offline providers.

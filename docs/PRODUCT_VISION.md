# Product Vision

## The challenge

People often wait until distress becomes a crisis before seeking help. Barriers include stigma, not knowing where to go, long waits, cost, language, and, for many residents of Abu Dhabi, distance from family. Clinicians in turn see patients late and with little longitudinal information. AI chat tools are increasingly used for emotional support, but many are unsafe at the edges: they may impersonate clinicians, miss crises, or encourage dependence.

## Our proposal

SaveTheSoul is a **bridge, not a replacement**. It offers accessible, supportive conversation and helps people notice meaningful changes in their wellbeing earlier. When the time comes, it connects them to the right level of real human care, from a trusted friend to a psychiatrist.

```
 Everyday support ──▶ Early recognition ──▶ Professional care ──▶ Safe escalation
 (AI companion)       (check-ins, WHO-5)    (directory, consented   (real emergency numbers,
                                             summaries, referrals)    patient-initiated alerts)
```

## Who it is for

- **Adults in Abu Dhabi** experiencing stress, anxiety, loneliness, low mood, sleep problems, or relationship and work pressure. They may not yet consider themselves "patients".
- **Psychiatrists and mental health professionals** who want consented, structured information and a clear referral and follow-up workflow.
- **Trusted family and friends**, but only as far as the user chooses.

## Product principles

1. **Honest about being AI.** The companion always identifies itself as an AI wellbeing companion.
2. **Human professionals decide.** No AI diagnosis, prescribing, risk determination or emergency dispatch.
3. **Safety is independent of the AI.** Deterministic safety rules run before and after the model. Emergency information works offline.
4. **Consent is granular, visible and revocable.** It is enforced on the server, not just in the interface.
5. **Simulated means labelled.** Every simulated workflow is visibly marked.
6. **Calm, warm design.** The interface is premium and reassuring, never clinical or frightening.

## Feature map (implemented)

| Module | Highlights |
|---|---|
| A. AI companion | Streaming chat, conversation history, history off and ephemeral mode, consent-controlled "Remember this" memory, provider abstraction, safe fallback |
| B. Wellbeing | Daily mood, stress, sleep and functioning check-ins; WHO-5 with official scoring; trend charts with table view; meaningful-change and sustained-decline explanations; goals |
| C. Safety Guardian | Rule-based detector (immediate, elevated, no flag), LLM bypass for explicit danger, safety check-in card, crisis panel, output guard, offline help page |
| D. Clinician portal | Overview, assigned patients, consent-gated patient detail, AI draft labelled UNVERIFIED with a review acknowledgement, notes, referrals, follow-ups, safety queue, audit trail |
| E. Care navigation | Abu Dhabi directory by level of care with verification status and source; referral state machine with history |
| F. Trusted circle | Contacts, relationship, permissions, shared categories, message preview, simulated send, blocked-attempt history, safety plan |
| G. Privacy | Encryption of sensitive fields, consent ledger, access history visible to the patient, JSON export, account deletion |
| H. Outcomes | Engagement, WHO-5 cohort trend, time to first contact, follow-up completion, functioning change, safety workflow and system errors, fairness framework (synthetic) |

## Future roadmap (P2)

- Voice conversation and Arabic-first experience (the RTL foundations are already in place).
- Real integrations with DoH-licensed providers, Malaffi (Abu Dhabi HIE) and electronic health records.
- Operational crisis partnerships with an approved escalation protocol.
- React Native (Expo) app reusing the API, validation schemas and domain logic.
- Clinically validated evaluation of the safety detector and companion responses.

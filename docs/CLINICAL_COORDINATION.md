# Clinical Coordination and Escalation

How Sakinah helps people reach human care, how clinicians receive AI-assisted information, and how urgent situations are escalated. Everything here runs on **synthetic data**. Every hand-off to a clinician, hospital or family member is **simulated** and labelled as simulated in the app.

## 1. Three kinds of information, never mixed

| Layer | Who creates it | Where it appears | Label |
|---|---|---|---|
| **Patient-reported and measured** | The patient: WHO-5, check-ins, goals, and the concerns form (areas, duration, frequency, daily-life impact, help wanted) | Shared summary, *Patient-reported and measured* card | "Patient-approved summary" |
| **AI observations** | `gpt-5.4-mini`, from the patient-approved structured snapshot **only** (never conversations) | *AI observations* card | **"AI-generated clinical support summary — requires professional review. Not a confirmed diagnosis."** plus review status |
| **Clinician-confirmed findings** | A licensed clinician (diagnosis, care plan) | *Clinician-confirmed findings* | Author, timestamp, audit entry. Append-only |

Rules the code enforces:
- The AI never writes to the clinician-confirmed layer, and never proposes diagnoses, risk levels, risk scores or medication.
- If the AI provider is the offline demo, **no AI draft is created**. Pre-written text never appears as AI output.
- Patient-reported concerns are always chosen by the patient. Nothing is inferred from tone, chat frequency or keywords.
- No numerical suicide-risk probability exists anywhere in the system.

## 2. Patient journey to professional help

1. The patient asks Sakinah for professional help. Sakinah explains the options: a GP or primary care, a psychologist, a psychiatrist, or a verified service. Its instructions say referrals are simulated.
2. **My Wellbeing** shows a plain-language, non-diagnostic summary with four actions: *Continue talking with Sakinah*, *Review wellbeing history*, *Find professional support*, *Prepare a summary for my clinician*.
3. **Find Support → Request a referral**: the patient chooses the kind of help (stored as `careType`), then the clinician or service, then the urgency.
4. **Share a summary**: the patient ticks exactly what to share, previews it, and confirms. This creates a category-scoped consent and a care assignment.
5. The request is recorded (`REQUESTED`). Acknowledgement and scheduling are performed by the synthetic clinician, or by the labelled *simulate acknowledgement* demo action. The patient follows the status on **Find Support**.
6. The patient can stop sharing at any time. The clinician loses access immediately, and later review attempts are refused (403).

No screen says that a real provider accepted a referral or an appointment.

## 3. Clinician workflow

For each assigned patient whose consent is active:
- Overview, WHO-5 trend, check-in trends, and the patient-approved summary (including reported concerns and duration or impact when shared).
- **AI observations** with the label above. Actions: **Approve**, **Correct** (the original draft is kept and the correction stored separately), **Reject**, each with an optional review note. Every decision is audited (`REVIEW_AI_DRAFT_*`).
- **Clinician-confirmed findings**: diagnosis or care plan, encrypted, audited (`FINDING_CREATED_*`), never edited (add a new entry to update), and included in the patient's data export.
- Referrals, follow-ups, safety alerts and private clinician notes (as before).

Access: an active care assignment **and** the patient's current sharing consent. Other clinicians get 403 and the attempt is audited.

## 4. Urgent safety escalation (human-led)

### What happens today (implemented)

1. The **Safety Guardian** (deterministic, independent of OpenAI) flags explicit danger before any AI call, including in voice mode and when the AI is rate-limited or unavailable.
2. **Immediately** shows pre-written crisis guidance with UAE numbers (998, 999, and 800-SAKINA as a separate, human-staffed service), plus the outside-the-UAE line. There is no wait for AI or speech.
3. Offers a **patient-initiated, simulated** alert to their care team and, with consent, a trusted contact.
4. Records a safety event (level, category, time; **never the message text**).

### Escalation states

| Target state | Today's status | Status |
|---|---|---|
| Concern identified | `OPEN` | Implemented |
| Human review requested | `SIMULATED_ALERT_SENT` | Implemented (simulated) |
| Human reviewer acknowledged | `SIMULATED_ACKNOWLEDGED` | Implemented (synthetic clinician or demo action) |
| Contact attempted | — | Design only |
| Appropriate assistance arranged | — | Design only |
| Completed | `CLOSED` | Implemented |
| Failed | `HANDOFF_FAILED` (for example, no care team) | Implemented. The patient is pointed back to the real numbers |

A "received" or "acknowledged" state is shown only for an acknowledgement that actually happened inside the system, by a synthetic clinician or the demo action. It is always labelled simulated. **No hospital, family member or emergency service is contacted automatically, and never on the basis of a model-generated score.**

### Ongoing, non-immediate deterioration

A sustained WHO-5 decline, or several concerning check-ins, leads to an offer of **professional review** (summary, support options, referral). It is never treated as a crisis.

## 5. What real-world escalation would require (not built)

- Operational partnerships with DoH-licensed providers and a staffed 24/7 receiving team.
- Clinical protocols signed off by clinicians: thresholds, scripts, and response times.
- Patient authorisation for emergency contact, verified contact details, and legal review under UAE law (PDPL, DoH and ADHICS requirements).
- Reliable delivery with acknowledgement, retries, failure handling and escalation timers, plus audit and incident review.
- UAE-hosted infrastructure and a data-processing agreement for any AI provider.

## 6. Deferred until after the hackathon

- Additional validated screening instruments (for example PHQ-9 and GAD-7, licensing permitting), each with clinician-confirmed interpretation.
- Real provider and hospital integrations, including Malaffi.
- Patient-selected conversation excerpts for clinicians. Conversations are never shared today.
- The "contact attempted" and "assistance arranged" states, staffed reviewer queues, and timers.
- Patient-facing view of clinician findings (they are already in the data export).

# Clinical Limitations

SaveTheSoul is a **prototype wellbeing tool**, not a medical device and not a clinical service.

## What it is not

- **Not a psychiatrist or clinician.** The companion is an AI that identifies itself as such. It offers general wellbeing suggestions, not treatment.
- **Not diagnostic.** No feature diagnoses a mental disorder. No diagnosis is inferred from sentiment, chat frequency or model labels. The AI cannot sign, confirm or record a diagnosis; approving an AI draft records a review, not a diagnosis.
- **Fictional diagnoses in the demo.** Two synthetic cases (Hana: Generalized Anxiety Disorder; Khalid: moderate depressive episode) carry diagnoses written as *clinician-authored* findings by the synthetic Dr. Aisha, marked "DEMO — Synthetic Patient and Fictional Clinical Record". They illustrate where a licensed professional's conclusion would sit; they are not AI output and are not based on any real person.
- **Not a risk assessment.** The Safety Guardian routes conversations to safer responses. Its categories are not clinical determinations of suicide risk, and a missing flag says nothing about safety.
- **Not an emergency service.** It cannot call anyone. Users are directed to 998, 999 and 800-SAKINA.
- **Not a prescriber.** It gives no medication advice, and model output containing medication instructions is blocked.

## WHO-5 Well-Being Index

- Scoring follows the published method: five items scored 0–5, raw score 0–25, multiplied by 4 to give 0–100. Incomplete responses are rejected rather than prorated.
- Interpretation shown to users:
  - **≤ 50**: lower wellbeing. Published guidance suggests further evaluation by a professional.
  - **A change of ≥ 10 points** is treated as meaningful (Topp et al., 2015).
  - **Two or more consecutive declines totalling ≥ 10 points** is shown as a sustained decline and prompts a suggestion of professional follow-up.
- Limitations shown in the app: it is a two-week self-report of wellbeing, not illness; a low score is not a diagnosis and a high score does not rule one out; it does not assess suicide or self-harm risk; it is affected by physical illness, sleep and life events.
- Validation of the WHO-5 in Arabic-speaking and multilingual UAE populations should be reviewed before clinical use. Translated versions must be the officially validated ones.

## Explore My Mental Wellbeing

- A structured self-report plus the person's own WHO-5 and check-ins. The output is labelled "Preliminary AI-generated clinical impression — not a confirmed diagnosis. Requires professional assessment."
- The AI may describe *areas a professional might explore* in everyday language. Statements naming a disorder, severity, risk level or medication are removed automatically, as is any statement without a source tag for data that exists.
- The WHO-5 is used as wellbeing context only, never as a test for a specific disorder.
- Uncertainty (no WHO-5, few check-ins) is listed explicitly. Nothing is stored. Crisis language bypasses the AI entirely.

## Self-reported check-ins

Mood, stress, sleep and functioning ratings (1–5) are simple self-report scales designed for this prototype. **They are not validated instruments.** Trends are descriptive only.

## AI-generated content

- Companion replies may be wrong, generic or culturally mismatched. Prompts and the output guard reduce but do not eliminate this.
- Clinician summary drafts are generated **only from the structured, patient-approved data**. They are labelled **UNVERIFIED** until a clinician records that they reviewed the draft against the source data. The deterministic structured summary is always shown beside the draft.

## Human oversight built in

- Clinicians only see consented information, and every access is audited.
- Referral status changes are made by people (or explicitly labelled simulation), and a referral is never described as accepted unless a clinician acknowledged it.
- Safety alerts are patient-initiated and require human acknowledgement. In the prototype both steps are simulated.
- The hospital emergency portal is a simulation for synthetic patients only. It is not monitored, does not dispatch help, and no real hospital, responder or family member is contacted.

## Evidence gaps before real-world use

1. Clinical review of every safety template, prompt and self-help suggestion by licensed mental health professionals in Abu Dhabi.
2. Prospective evaluation of the safety detector (sensitivity and false-negative analysis) on representative, ethically sourced data, including Arabic and code-switched text.
3. Usability testing with the target population, including people with lived experience.
4. Regulatory classification (medical-device status) and DoH engagement.
5. Measurement of real outcomes (time to care, follow-up completion, wellbeing change), with ethics approval.

## Demo data

Every patient, clinician, referral, alert and statistic in the demonstration is **synthetic**. The fairness dashboard values are invented to demonstrate the monitoring framework.

# Clinical Limitations

SaveTheSoul is a **prototype wellbeing tool**, not a medical device and not a clinical service.

## What it is not

- **Not a psychiatrist or clinician.** The companion is an AI that identifies itself as such. It offers general wellbeing suggestions, not treatment.
- **Not diagnostic.** No feature diagnoses a mental disorder. No diagnosis is inferred from sentiment, chat frequency or model labels.
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

## Self-reported check-ins

Mood, stress, sleep and functioning ratings (1–5) are simple self-report scales designed for this prototype. **They are not validated instruments.** Trends are descriptive only.

## AI-generated content

- Companion replies may be wrong, generic or culturally mismatched. Prompts and the output guard reduce but do not eliminate this.
- Clinician summary drafts are generated **only from the structured, patient-approved data**. They are labelled **UNVERIFIED** until a clinician records that they reviewed the draft against the source data. The deterministic structured summary is always shown beside the draft.

## Human oversight built in

- Clinicians only see consented information, and every access is audited.
- Referral status changes are made by people (or explicitly labelled simulation), and a referral is never described as accepted unless a clinician acknowledged it.
- Safety alerts are patient-initiated and require human acknowledgement. In the prototype both steps are simulated.

## Evidence gaps before real-world use

1. Clinical review of every safety template, prompt and self-help suggestion by licensed mental health professionals in Abu Dhabi.
2. Prospective evaluation of the safety detector (sensitivity and false-negative analysis) on representative, ethically sourced data, including Arabic and code-switched text.
3. Usability testing with the target population, including people with lived experience.
4. Regulatory classification (medical-device status) and DoH engagement.
5. Measurement of real outcomes (time to care, follow-up completion, wellbeing change), with ethics approval.

## Demo data

Every patient, clinician, referral, alert and statistic in the demonstration is **synthetic**. The fairness dashboard values are invented to demonstrate the monitoring framework.

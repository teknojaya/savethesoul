import { describe, expect, it } from "vitest";
import { allowedTags, buildDraftInput, groundClinicalDraft } from "@/features/ai/clinical-draft";

/** Synthetic shared snapshot: WHO-5, check-ins and patient-reported concerns (no note, no goals). */
const source = {
  patient: { ageBand: "35-44", region: "Abu Dhabi" },
  who5: [{ date: "2026-09-10", percentScore: 72 }, { date: "2026-11-05", percentScore: 36 }],
  sleepStress: { sleepRecent: 2, sleepPrior: 3, stressRecent: 4, stressPrior: 4 },
  reportedConcerns: { areas: ["Stress or pressure", "Sleep"], duration: "1–3 months", frequency: "Nearly every day", dailyLifeImpact: "A lot", helpWanted: null },
};

describe("AI clinical draft grounding (regression)", () => {
  it("separates demographics from patient-reported concerns in the model input", () => {
    const input = buildDraftInput(source);
    expect(input.demographics.ageBand).toBe("35-44");
    expect(JSON.stringify(input.patientReportedConcerns)).not.toContain("35-44");
    expect(input.demographics.note).toMatch(/never a symptom or concern/i);
  });

  it("removes an age band classified as a patient-reported concern (the reported bug)", () => {
    const raw = [
      "Patient-reported concerns:",
      "- Patient reports stress and poor sleep, nearly every day for 1–3 months [Patient-reported concerns]",
      "- Age band: 35–44 [Patient-reported concerns]",
      "- Patient is aged 35-44 [Demographics]",
      "Other shared context:",
      "- Age band 35–44 [Demographics]",
      "Assessment results and changes over time:",
      "- WHO-5 decreased from 72 to 36 [WHO-5]",
    ].join("\n");
    const g = groundClinicalDraft(raw, source);
    expect(g.text).not.toBeNull();
    const concerns = g.text!.split("Other shared context:")[0];
    expect(concerns).not.toMatch(/35/);
    expect(g.text).toMatch(/Other shared context:\n- Age band 35–44 \[Demographics\]/);
    expect(g.reasons).toEqual(expect.arrayContaining(["demographics presented as a concern"]));
    expect(g.removed).toBe(2);
    expect(g.text).toMatch(/2 AI statements were removed by automatic grounding checks/);
  });

  it("removes unsupported findings: no source, unshared sources, diagnoses, risk levels and medication", () => {
    const raw = [
      "Preliminary AI-generated clinical impression — not a confirmed diagnosis. Requires professional assessment.",
      "Assessment results and changes over time:",
      "- WHO-5 decreased from 72 to 36 across the period [WHO-5]",
      "- Sleep rated 2 recently vs 3 before [Check-ins]",
      "Preliminary observations (AI, unverified):",
      "- Presentation is consistent with major depressive disorder [WHO-5]",
      "- Suicide risk level appears moderate [Check-ins]",
      "- Patient has a history of childhood trauma",
      "- Patient's goals focus on exercise [Goals]",
      "- An SSRI may be appropriate [Patient-reported concerns]",
      "- Low wellbeing has persisted alongside reported sleep difficulty [WHO-5][Check-ins]",
      "Questions the clinician may wish to explore:",
      "- How the patient describes changes in sleep [Patient-reported concerns]",
    ].join("\n");
    const g = groundClinicalDraft(raw, source);
    expect(g.kept).toBe(4);
    expect(g.removed).toBe(5);
    expect(g.text).not.toMatch(/major depressive|risk level|trauma|goals|SSRI/i);
    expect(g.reasons).toEqual(expect.arrayContaining(["no source", "cites data that was not shared", "diagnostic, risk or treatment content"]));
    expect(g.text).not.toMatch(/AI-generated clinical support summary/); // the UI shows the label itself
  });

  it("rejects a draft with too little grounded content", () => {
    const g = groundClinicalDraft("- The patient seems depressed\n- Likely generalized anxiety disorder [WHO-5]", source);
    expect(g.text).toBeNull();
  });

  it("only allows tags for data that was actually shared", () => {
    expect([...allowedTags(source)].sort()).toEqual(["[Check-ins]", "[Demographics]", "[Patient-reported concerns]", "[WHO-5]"]);
  });
});

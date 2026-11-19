import { describe, expect, it } from "vitest";
import { EMERGENCY_STATUSES, STATUS_LABEL, TERMINAL, allowedNext, canTransition } from "@/features/emergency/state-machine";
import { EXPLORE_LABEL, EXPLORE_SECTIONS, groundExplore } from "@/features/ai/explore";
import { DEMO_GROUPS, DEMO_LOGIN_KEYS } from "@/features/demo/accounts";
import { cleanDemoText } from "@/lib/demo-text";

describe("Emergency workflow state machine (simulated, human-led)", () => {
  it("covers every required status and closes terminal states", () => {
    expect(EMERGENCY_STATUSES).toEqual([
      "DETECTED", "REVIEW_REQUESTED", "ACKNOWLEDGED", "CONTACT_ATTEMPTED", "ASSISTANCE_ARRANGED", "RESOLVED", "FAILED", "CANCELLED", "UNABLE_TO_CONTACT",
    ]);
    for (const t of TERMINAL) expect(allowedNext(t)).toEqual([]);
  });
  it("requires human review and acknowledgement before any contact or resolution", () => {
    expect(canTransition("DETECTED", "ACKNOWLEDGED")).toBe(false);
    expect(canTransition("REVIEW_REQUESTED", "CONTACT_ATTEMPTED")).toBe(false);
    expect(canTransition("REVIEW_REQUESTED", "RESOLVED")).toBe(false);
    expect(canTransition("REVIEW_REQUESTED", "ACKNOWLEDGED")).toBe(true);
    expect(canTransition("ACKNOWLEDGED", "CONTACT_ATTEMPTED")).toBe(true);
    expect(canTransition("CONTACT_ATTEMPTED", "UNABLE_TO_CONTACT")).toBe(true);
    expect(canTransition("UNABLE_TO_CONTACT", "CONTACT_ATTEMPTED")).toBe(true);
  });
  it("has a plain label for every status", () => {
    for (const s of EMERGENCY_STATUSES) expect(STATUS_LABEL[s]).toBeTruthy();
  });
});

describe("Explore grounding", () => {
  const raw = [
    "What you told me:",
    "- You have felt worried most days for over 3 months [Your answers]",
    "- You wrote that work feels overwhelming [Your words]",
    "Your wellbeing results:",
    "- Your WHO-5 score dropped recently [WHO-5]",
    "- Your check-ins show low mood [Check-ins]",
    "How this seems to be affecting you:",
    "- This could indicate major depressive disorder [Your answers]",
    "- Consider asking about sertraline [Your answers]",
    "- Your risk level is high [Your answers]",
    "Possible areas a professional might explore:",
    "- Ongoing worry and sleep difficulties [Your answers]",
    "- Something with no source",
  ].join("\n");

  it("keeps only sourced, non-diagnostic statements from data that exists", () => {
    const g = groundExplore(raw, { who5: false, checkIns: true, ownWords: true });
    expect(g.text).toContain("worried most days");
    expect(g.text).toContain("work feels overwhelming");
    expect(g.text).toContain("low mood");
    expect(g.text).toContain("Ongoing worry");
    expect(g.text).not.toMatch(/WHO-5 score/); // no WHO-5 on record
    expect(g.text).not.toMatch(/depressive disorder|sertraline|risk level|no source/);
    expect(g.removed).toBeGreaterThanOrEqual(5);
  });
  it("treats the person's own words as a source only if they wrote any", () => {
    const g = groundExplore(raw, { who5: true, checkIns: true, ownWords: false });
    expect(g.text).not.toContain("work feels overwhelming");
  });
  it("carries the preliminary-impression label and six sections", () => {
    expect(EXPLORE_LABEL).toBe("Preliminary AI-generated clinical impression — not a confirmed diagnosis. Requires professional assessment.");
    expect(EXPLORE_SECTIONS).toHaveLength(6);
  });
});

describe("Demo role cards", () => {
  it("offers Patient, Clinician and Hospital Emergency demos with server-validated keys only", () => {
    expect(DEMO_GROUPS.map((g) => g.title)).toEqual(["Patient Demo", "Clinician Demo", "Hospital Emergency Demo"]);
    expect(DEMO_GROUPS.flatMap((g) => g.accounts.map((a) => a.key)).sort()).toEqual([...DEMO_LOGIN_KEYS].sort());
    expect(JSON.stringify(DEMO_GROUPS)).not.toMatch(/password/i);
  });
});

describe("Demo text presentation", () => {
  it("removes demo markers for display without changing meaning", () => {
    expect(cleanDemoText("DEMO — Synthetic Patient and Fictional Clinical Record. Example clinician-authored diagnosis: Generalized Anxiety Disorder (ICD-10 F41.1). Basis (fictional): evaluation.")).toBe(
      "Generalized Anxiety Disorder (ICD-10 F41.1). Basis: evaluation.",
    );
    expect(cleanDemoText("University exams and not sleeping. (synthetic)")).toBe("University exams and not sleeping.");
    expect(cleanDemoText("UNVERIFIED AI DRAFT (synthetic)\n• WHO-5 scores")).toBe("• WHO-5 scores");
    expect(cleanDemoText("Fictional: Khalifa City, Abu Dhabi (synthetic location)")).toBe("Khalifa City, Abu Dhabi");
    expect(cleanDemoText(null)).toBeNull();
  });
});

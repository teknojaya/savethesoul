import { describe, expect, it } from "vitest";
import { assessMessage } from "@/features/safety/classifier";
import { elevatedConcernFallback, immediateDangerResponse, LLM_UNAVAILABLE_RESPONSE } from "@/features/safety/responses";

/** UAE numbers must never be presented as if they work everywhere (synthetic messages). */
describe("safety responses make the UAE scope of emergency numbers explicit", () => {
  const immediate = [
    "I'm going to kill myself tonight",
    "I'm going to hurt him tonight",
    "I took a whole bottle of pills",
    "I'm not safe at home right now",
  ];
  it.each(immediate)("immediate: %s", (text) => {
    const a = assessMessage(text);
    expect(a.level).toBe("IMMEDIATE_DANGER");
    const r = immediateDangerResponse(a);
    expect(r).toMatch(/99[89]/);
    expect(r).toMatch(/outside the UAE, please call your local emergency number/);
  });

  it.each(["I can't go on like this anymore", "I've been thinking about hurting myself"])("elevated: %s", (text) => {
    const a = assessMessage(text);
    expect(a.level).toBe("ELEVATED_CONCERN");
    const r = elevatedConcernFallback(a);
    if (/99[89]/.test(r)) expect(r).toMatch(/outside the UAE/);
  });

  it("the outage fallback names the numbers as UAE emergency numbers", () => {
    expect(LLM_UNAVAILABLE_RESPONSE).toMatch(/998/);
  });
});

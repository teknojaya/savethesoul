import type { SafetyAssessment } from "./classifier";

/**
 * Deterministic, clinician-reviewable safety responses. These are used instead of
 * (IMMEDIATE) or in addition to (ELEVATED) the LLM, and are the fallback whenever the
 * LLM is unavailable. They contain no promises to prevent harm or to have contacted anyone.
 */

export function immediateDangerResponse(a: SafetyAssessment): string {
  if (a.categories.includes("HARM_TO_OTHERS")) {
    return [
      "I'm really glad you told me. It sounds like someone could be in danger right now, and this needs real people who can act immediately.",
      "",
      "**Please call 999 (Police) now.** If anyone is hurt, call **998 (Ambulance)**.",
      "",
      "If you can, put distance between yourself and anything that could be used to hurt someone, and move away from the person. 800-SAKINA (800 725462) is also available 24/7 to talk.",
      "",
      "I'm an AI companion, so I can't call anyone for you — but I'll stay here while you reach out.",
    ].join("\n");
  }
  if (a.categories.includes("UNSAFE_ENVIRONMENT")) {
    return [
      "Thank you for telling me. Your safety matters most right now.",
      "",
      "**If you are in immediate danger, call 999 (Police).** If you are hurt, call **998 (Ambulance)**.",
      "",
      "If it's not safe to talk, Abu Dhabi Police's Aman service accepts SMS at 2828. When you're able, try to get to a safe place or near people you trust.",
      "",
      "I'm an AI companion and can't contact anyone for you, but the options on your screen can connect you to people who can help right now.",
    ].join("\n");
  }
  if (a.categories.includes("OVERDOSE_OR_ACT_IN_PROGRESS")) {
    return [
      "I'm really glad you told me. What you've described is a medical emergency.",
      "",
      "**Please call 998 (Ambulance) right now**, or ask someone near you to call. Tell them what you have taken or done and when.",
      "",
      "If you can, unlock your door and stay where someone can reach you. Don't wait to see whether you feel worse.",
      "",
      "I'm an AI companion and can't call for you — please reach a person now. You matter, and help is available.",
    ].join("\n");
  }
  return [
    "I'm really glad you told me, and I'm so sorry you're in this much pain. Your safety matters most right now.",
    "",
    "**If you might act on these thoughts, please call 998 (Ambulance) or 999 (Police) now.**",
    "",
    "You can also talk to someone at **800-SAKINA (800 725462)** — free, confidential, 24/7, in Arabic and English.",
    "",
    "If you can, move away from anything you could use to hurt yourself, and go to a place where other people are around. Reaching out to someone you trust right now could help too.",
    "",
    "I'm an AI companion, not a clinician, and I can't contact anyone on your behalf — but I'm here with you while you reach out.",
  ].join("\n");
}

export const SAFETY_CHECK_QUESTION =
  "I want to check in with you, because what you shared sounds really heavy. Are you having thoughts of ending your life, or are you in danger right now?";

export function elevatedConcernFallback(a: SafetyAssessment): string {
  if (a.categories.includes("THIRD_PARTY_CONCERN")) {
    return [
      "It sounds like you're worried about someone you care about — that's a lot to carry, and it's good that you're taking it seriously.",
      "",
      "If they may act on it right now, please call **999** or **998**. If it's less immediate, **800-SAKINA (800 725462)** can advise you on how to support them, 24/7.",
      "",
      "It can help to ask them directly and calmly whether they're thinking about suicide — asking does not put the idea in their head. Would you like to talk through how to do that?",
    ].join("\n");
  }
  return [
    "Thank you for trusting me with this. It sounds like you're going through something really painful.",
    "",
    SAFETY_CHECK_QUESTION,
    "",
    "Whatever your answer, you deserve support from real people too. **800-SAKINA (800 725462)** is free, confidential and available 24/7. If you're in immediate danger, please call **998** or **999**.",
  ].join("\n");
}

export const LLM_UNAVAILABLE_RESPONSE = [
  "I'm sorry — I'm having trouble responding right now. This is a technical problem on our side, not anything you did.",
  "",
  "If you need to talk to someone now, **800-SAKINA (800 725462)** is available 24/7. In an emergency, call **998** or **999**.",
  "",
  "You can try sending your message again in a moment.",
].join("\n");

export const OUTPUT_BLOCKED_RESPONSE = [
  "I started to write something that wasn't appropriate for me to say as an AI wellbeing companion, so I've held it back.",
  "",
  "I can't diagnose conditions or advise on medication — a doctor or psychiatrist is the right person for that. I'm happy to keep talking about how you're feeling, or to help you find professional support.",
].join("\n");

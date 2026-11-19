/**
 * Sakinah: the name of SaveTheSoul's AI wellbeing companion (text and voice).
 * Sakinah is independent. An official mental health service called SAKINA operates in Abu
 * Dhabi (the 800-SAKINA support line); SaveTheSoul is not affiliated with it, and the app
 * always presents that line as a separate, human-staffed service.
 */
export const SAKINAH_NAME = "Sakinah";
export const SAKINAH_SUBTITLE = "Your AI Wellbeing Companion";
export const SAKINAH_NON_AFFILIATION =
  "Sakinah is SaveTheSoul's independent AI companion. It is not affiliated with the official 800-SAKINA mental health support line, which is a separate service staffed by people.";

/** Spoken and shown when Voice Mode starts. Must match the recorded welcome audio exactly. */
export const SAKINAH_WELCOME_TEXT =
  "Hello, I'm Sakinah, your AI wellbeing companion. I'm here to listen, support you, and help you through whatever is on your mind or whatever you're going through. You can share anything you're comfortable with, at your own pace. How are you feeling today?";

/** Pre-generated once with scripts/generate-welcome-audio.ts (no paid call per page load). */
export const SAKINAH_WELCOME_AUDIO_PATH = "/audio/sakinah-welcome.mp3";

/** Delivery style for text-to-speech models that accept instructions. */
export const SAKINAH_VOICE_INSTRUCTIONS =
  "Speak as a calm, warm and gentle wellbeing companion. Use a soft, reassuring, unhurried pace with natural pauses. Sound kind and professional, never theatrical, cheerful or dramatic.";

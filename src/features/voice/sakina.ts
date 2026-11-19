/**
 * Sakina: the name of SaveTheSoul's AI companion in Voice Mode.
 * The name is provisional. SaveTheSoul is not affiliated with any other service that uses
 * the name "Sakina", including the 800-SAKINA mental health support line.
 */
export const SAKINA_NAME = "Sakina";
export const SAKINA_SUBTITLE = "Your AI Wellbeing Companion";
export const SAKINA_NON_AFFILIATION =
  "Sakina is SaveTheSoul's AI companion. It is not connected to the 800-SAKINA helpline or any other service with a similar name.";

/** Spoken and shown when Voice Mode starts. Must match the recorded welcome audio exactly. */
export const SAKINA_WELCOME_TEXT =
  "Hello, I'm Sakina, your AI wellbeing companion. I'm here to listen, support you, and help you through whatever is on your mind or whatever you're going through. You can share anything you're comfortable with, at your own pace. How are you feeling today?";

/** Pre-generated once with scripts/generate-welcome-audio.ts (no paid call per page load). */
export const SAKINA_WELCOME_AUDIO_PATH = "/audio/sakina-welcome.mp3";

/** Delivery style for text-to-speech models that accept instructions. */
export const SAKINA_VOICE_INSTRUCTIONS =
  "Speak as a calm, warm and gentle wellbeing companion. Use a soft, reassuring, unhurried pace with natural pauses. Sound kind and professional, never theatrical, cheerful or dramatic.";

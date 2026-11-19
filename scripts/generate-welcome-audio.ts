/**
 * Generates Sakina's welcome greeting once, as a static asset, so no paid speech call is made
 * on page load. Re-run only if the welcome text, voice or model changes:
 *
 *   pnpm exec tsx scripts/generate-welcome-audio.ts   (uses OPENAI_API_KEY from .env)
 *
 * The audio is AI-generated; the UI labels Sakina's voice as an AI voice.
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import OpenAI from "openai";
import { SAKINA_VOICE_INSTRUCTIONS, SAKINA_WELCOME_TEXT } from "../src/features/voice/sakina";

const model = process.env.VOICE_TTS_MODEL || "gpt-4o-mini-tts";
const voice = process.env.VOICE_TTS_VOICE || "marin";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
async function main() {
  const res = await client.audio.speech.create({ model, voice, input: SAKINA_WELCOME_TEXT, response_format: "mp3", instructions: SAKINA_VOICE_INSTRUCTIONS });
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync("public/audio/sakina-welcome.mp3", buf);
  console.log(`wrote public/audio/sakina-welcome.mp3 (${buf.length} bytes) model=${model} voice=${voice} chars=${SAKINA_WELCOME_TEXT.length}`);
}

main().catch((e) => {
  console.error("failed:", e instanceof Error ? e.message : "unknown error");
  process.exitCode = 1;
});

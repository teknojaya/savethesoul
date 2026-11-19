/**
 * Generates Sakinah's welcome greeting once, as a static asset, so no paid speech call is made
 * on page load. Re-run only if the welcome text, voice or model changes:
 *
 *   pnpm exec tsx scripts/generate-welcome-audio.ts   (uses OPENAI_API_KEY from .env)
 *
 * The audio is AI-generated; the UI labels Sakinah's voice as an AI voice.
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import OpenAI, { toFile } from "openai";
import { SAKINAH_VOICE_INSTRUCTIONS, SAKINAH_WELCOME_TEXT } from "../src/features/voice/sakinah";

const model = process.env.VOICE_TTS_MODEL || "gpt-4o-mini-tts";
const voice = process.env.VOICE_TTS_VOICE || "marin";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const norm = (t: string) => t.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();

/**
 * Generated speech occasionally drops or changes words, so each take is transcribed back and
 * only kept if every word of the welcome is present (the name may be transcribed "Sakina").
 */
async function main() {
  const expected = norm(SAKINAH_WELCOME_TEXT);
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await client.audio.speech.create({ model, voice, input: SAKINAH_WELCOME_TEXT, response_format: "mp3", instructions: SAKINAH_VOICE_INSTRUCTIONS });
    const buf = Buffer.from(await res.arrayBuffer());
    const heard = await client.audio.transcriptions.create({ file: await toFile(buf, "welcome.mp3", { type: "audio/mpeg" }), model: "gpt-4o-mini-transcribe", language: "en" });
    const ok = norm(heard.text).replace(/\bsakina\b/, "sakinah") === expected;
    console.log(`take ${attempt}: ${buf.length} bytes, complete=${ok}`);
    if (ok) {
      writeFileSync("public/audio/sakinah-welcome.mp3", buf);
      console.log(`wrote public/audio/sakinah-welcome.mp3 model=${model} voice=${voice} chars=${SAKINAH_WELCOME_TEXT.length}`);
      return;
    }
  }
  throw new Error("No complete take after 4 attempts; the existing file was left unchanged.");
}

main().catch((e) => {
  console.error("failed:", e instanceof Error ? e.message : "unknown error");
  process.exitCode = 1;
});

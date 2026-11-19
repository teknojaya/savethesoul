/** Longest text sent for one spoken reply (below the provider's input limit). */
export const MAX_SPEECH_CHARS = 3800;

/**
 * Turns a chat reply (light Markdown) into plain text for text-to-speech: no asterisks,
 * list markers or links read aloud. Long replies are cut at a sentence boundary; the full
 * text always stays visible in the chat.
 */
export function toSpeakableText(markdown: string): string {
  let t = markdown
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\s][^*]*)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/^\s*(\d+)[.)]\s+/gm, "$1. ")
    .replace(/[#`_>]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
  if (t.length > MAX_SPEECH_CHARS) {
    const cut = t.slice(0, MAX_SPEECH_CHARS);
    const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "), cut.lastIndexOf("\n"));
    t = (end > MAX_SPEECH_CHARS * 0.5 ? cut.slice(0, end + 1) : cut).trim();
  }
  return t;
}

/**
 * Splits a spoken reply into a short opening (1–2 sentences, synthesised and played first so
 * Sakina starts speaking quickly) and the remainder, played straight after. Deterministic, so
 * the server can serve either part by index.
 */
export function splitForSpeech(text: string): string[] {
  const t = text.trim();
  if (t.length <= 220) return t ? [t] : [];
  const sentences = t.match(/[^.!?\n]+[.!?]*["')\]]*\s*|\n+/g) ?? [t];
  let first = "";
  for (const s of sentences) {
    if (first.length >= 60 && first.length + s.length > 220) break;
    first += s;
    if (first.length >= 160) break;
  }
  first = first.trim();
  const rest = t.slice(t.indexOf(first) + first.length).trim();
  return rest ? [first, rest] : [first];
}

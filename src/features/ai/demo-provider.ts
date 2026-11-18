import type { ChatProvider, GenerateInput } from "./types";

/**
 * Offline demo companion.
 *
 * Used when no LLM API key is configured (or LLM_PROVIDER=demo). It returns
 * pre-written, evidence-informed supportive responses selected by simple topic
 * matching. It is clearly labelled in the UI as NOT AI-generated, so judges can
 * exercise every flow without a key while understanding what they are seeing.
 */

interface Topic {
  id: string;
  match: RegExp;
  replies: string[];
}

const TOPICS: Topic[] = [
  {
    id: "work",
    match: /\b(work|job|boss|deadline|office|manager|colleague|workload|overtime|burn ?out)\b/i,
    replies: [
      "That sounds like a lot of pressure at work. When everything feels urgent, it's natural for your body to stay on high alert, even after you leave the office.\n\nOne thing that often helps is separating what's within your control today from what isn't. If you like, try writing down the three tasks that matter most this week — just three — and notice how it feels to set the rest aside for now.\n\nWhat part of work has been weighing on you the most?",
      "It makes sense that you're feeling stretched. Work stress tends to build quietly until it spills into sleep, mood and relationships.\n\nA short reset can help between tasks: breathe in slowly for 4 counts, hold for 4, out for 6, and repeat four times. Longer out-breaths help signal to your nervous system that it can settle.\n\nWould it help to talk through what a more manageable week could look like?",
    ],
  },
  {
    id: "sleep",
    match: /\b(sleep|insomnia|awake|tired|exhausted|can't sleep|night)\b/i,
    replies: [
      "Poor sleep can make everything feel harder — emotions feel bigger and problems feel heavier.\n\nA few things that help many people: keeping a similar wake-up time every day (even after a bad night), getting daylight in the morning, and having a 30-minute wind-down without screens. If you're lying awake for a long time, getting up and doing something calm in dim light until you feel sleepy often works better than staying in bed.\n\nHow long has your sleep been like this? If it's been several weeks, it's worth mentioning to a doctor.",
    ],
  },
  {
    id: "lonely",
    match: /\b(lonely|alone|isolated|no friends|no one|nobody|miss (my )?(family|home))\b/i,
    replies: [
      "Feeling lonely is painful, and it's more common than people admit — especially when you're far from family or in a new place.\n\nConnection often starts small: a message to one person you used to be close to, a short call home, or joining a regular activity where you see the same faces. It doesn't have to be deep straight away.\n\nIs there one person you've been meaning to reach out to? I'm happy to help you think about what to say. I'm an AI, so I can't replace the people in your life — but I can help you find your way back to them.",
    ],
  },
  {
    id: "anxiety",
    match: /\b(anxious|anxiety|panic|worried|worry|nervous|overthinking|racing thoughts)\b/i,
    replies: [
      "Anxiety can feel overwhelming, and it's understandable that you want it to stop.\n\nLet's try a quick grounding exercise together. Look around and notice:\n- 5 things you can see\n- 4 things you can feel\n- 3 things you can hear\n- 2 things you can smell\n- 1 thing you can taste\n\nTake your time. How do you feel after trying it? If anxiety is getting in the way of daily life most days, a mental health professional can help — and there are good, effective approaches for it.",
    ],
  },
  {
    id: "family",
    match: /\b(family|parents?|mother|father|mum|mom|dad|husband|wife|marriage|divorce|kids?|children|relationship|partner|argument|fight)\b/i,
    replies: [
      "Family and relationship difficulties can be some of the hardest things to carry, because they touch so much of daily life.\n\nSometimes it helps to separate what happened from the story we tell ourselves about it. If you'd like, you could write down: what happened, what you felt, and what you needed in that moment. It can make the next conversation a little clearer.\n\nWhat's been happening, if you'd like to share?",
    ],
  },
  {
    id: "sad",
    match: /\b(sad|down|low|depressed|empty|cry|crying|numb|hopeless|unhappy)\b/i,
    replies: [
      "I'm sorry you're feeling this way. Feeling low can make even small things feel heavy.\n\nWhen mood is low, motivation usually follows action rather than coming first. One small, kind thing — a short walk, a shower, a message to someone, stepping outside for a few minutes — can be a gentle start.\n\nHow long have you been feeling like this? If it's been more than a couple of weeks, a short WHO-5 check-in in My Wellbeing can help you keep track, and talking with a professional could really help.",
    ],
  },
];

const GENERAL = [
  "Thank you for sharing that with me. I'm here to listen.\n\nCould you tell me a little more about what's been on your mind? Sometimes putting things into words helps them feel a bit more manageable.",
  "I hear you. It takes something to put how you feel into words.\n\nIf you're not sure where to start, a journaling prompt can help: *“Right now I'm feeling… because… and what I need most is…”*. What comes up for you?",
];

const SUMMARY_TEMPLATE =
  "UNVERIFIED DRAFT (offline template — not AI-generated). Patient-shared structured data indicates the trends shown above. Please review the WHO-5 history and self-reported check-ins directly before drawing any conclusions.";

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

export function demoReplyFor(text: string, turnIndex: number): string {
  const topic = TOPICS.find((t) => t.match.test(text));
  return topic ? pick(topic.replies, hash(text) + turnIndex) : pick(GENERAL, hash(text) + turnIndex);
}

export class DemoProvider implements ChatProvider {
  readonly id = "demo";
  readonly label = "Offline demo companion (pre-written responses)";
  readonly isGenerative = false;

  constructor(private delayMs = 18) {}

  async *stream(input: GenerateInput): AsyncIterable<string> {
    const lastUser = [...input.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const reply = /clinician summary/i.test(input.system)
      ? SUMMARY_TEMPLATE
      : demoReplyFor(lastUser, input.messages.length);
    const words = reply.split(/(\s+)/);
    for (const w of words) {
      if (input.signal?.aborted) return;
      if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
      yield w;
    }
  }

  async complete(input: GenerateInput): Promise<string> {
    let out = "";
    for await (const c of this.stream(input)) out += c;
    return out;
  }
}

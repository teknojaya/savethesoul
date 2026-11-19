import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy & AI notice" };

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "What SaveTheSoul is — and isn't",
    body: [
      "SaveTheSoul is an AI wellbeing companion. It is not a doctor, psychiatrist or emergency service, and it does not diagnose conditions, prescribe treatment, or assess suicide risk.",
      "This is a prototype for the Future Health Digital Innovation Challenge 2026. It has not been certified as a medical device or assessed for regulatory compliance.",
    ],
  },
  {
    title: "How AI processes your messages",
    body: [
      "When you chat with the companion, your message and recent conversation are sent from our server to a large language model provider (OpenAI's GPT models in this demo deployment; Anthropic's Claude is also supported) to generate a reply. Requests are sent with storage disabled. API keys are held only on our server.",
      "Before any message reaches the AI, an independent rule-based safety check looks for language suggesting immediate danger. If it finds some, the AI is bypassed and you're shown real emergency contacts.",
      "If no AI provider is configured, an offline demo companion with pre-written responses is used and clearly labelled.",
      "Voice Mode (optional, separate consent): when you tap the microphone, your recording is sent from our server to OpenAI to be transcribed and is not stored by SaveTheSoul. Sakinah's replies are turned into speech by OpenAI. You review each transcript before it is sent, and only sent messages are saved (encrypted). Sakinah is SaveTheSoul's independent AI companion and is not affiliated with the official 800-SAKINA support line.",
      "If you share a summary with a clinician, the AI may draft a short summary from the structured data you approved (never from your conversations). It is labelled unverified until the clinician reviews it.",
    ],
  },
  {
    title: "What we store",
    body: [
      "Conversations (if history is on), check-ins, WHO-5 answers, goals, trusted contacts, consents, referrals and safety-plan content. Free text such as messages, notes and contact details is encrypted in our database.",
      "We record that a safety pathway was triggered (category and time), but not the message text.",
      "We keep an audit log of who accessed your information. It contains no message content.",
      "We do not collect your date of birth, nationality, or precise location. An optional age band helps fairness monitoring.",
    ],
  },
  {
    title: "Who can see your information",
    body: [
      "Only you, by default. Your conversations are never shared with clinicians, family members or employers.",
      "A clinician can only see what you choose to share with them, and only while your consent is active. You can preview a summary before sharing and revoke access at any time.",
      "Trusted contacts only receive messages you choose to send, limited to the categories you allow. In the prototype these messages are simulated and never delivered.",
      "SaveTheSoul never shares information with employers.",
    ],
  },
  {
    title: "Your controls",
    body: [
      "Turn chat history or personal memory off at any time — turning them off deletes what was stored.",
      "Delete individual conversations, export all your data as a file, or permanently delete your account from Profile & Privacy.",
    ],
  },
  {
    title: "Retention",
    body: [
      "Prototype policy: data is kept until you delete it or your account. Conversations created with history off are removed within 24 hours. Deleting your account removes your records; audit entries keep only an opaque identifier for accountability.",
      "A production deployment would define retention periods with the clinical governance team and in line with UAE and Abu Dhabi health-data requirements (see docs/PRIVACY_AND_CONSENT.md).",
    ],
  },
];

export default function PrivacyNoticePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-600">Plain-language notice</p>
      <h1 className="mt-1 font-display text-[34px] text-ink">Privacy & AI notice</h1>
      <div className="mt-8 space-y-8">
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2 className="font-display text-xl text-ink">{s.title}</h2>
            <ul className="mt-3 space-y-2 text-[15px] leading-relaxed text-ink-soft">
              {s.body.map((b) => (
                <li key={b} className="ps-4 [text-indent:-1rem] before:me-2 before:text-teal-500 before:content-['•']">
                  {b}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

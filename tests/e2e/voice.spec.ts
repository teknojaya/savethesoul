import { readFileSync } from "node:fs";
import { expect, test, type Page, type Request } from "@playwright/test";
import { deleteIsolatedPatient, registerIsolatedPatient } from "./support";

/**
 * Sakinah Voice Mode in a real Chromium with a fake microphone (synthetic audio).
 * The two OpenAI-backed endpoints (/api/voice/transcribe, /api/voice/speech) are stubbed here;
 * the chat itself runs through the real chat route, Safety Guardian and database.
 */
test.use({
  permissions: ["microphone"],
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] },
});
test.describe.configure({ mode: "serial" });
// Each test uses a fresh synthetic patient, deleted afterwards (safe to run against production).
test.afterEach(({ page }) => deleteIsolatedPatient(page));

const WELCOME =
  "Hello, I'm Sakinah, your AI wellbeing companion. I'm here to listen, support you, and help you through whatever is on your mind or whatever you're going through. You can share anything you're comfortable with, at your own pace. How are you feeling today?";
const MP3 = readFileSync("public/audio/sakinah-welcome.mp3");

/** Stubs the audio provider endpoints; records what the page sends. */
async function stubVoice(page: Page, transcripts: string[]) {
  const seen = { transcribe: [] as Request[], speech: [] as string[] };
  let consented = false;
  await page.route("**/api/voice/consent", async (route) => {
    if (route.request().method() === "POST") consented = true;
    await route.fulfill({ json: { available: true, consented, limits: { maxSeconds: 60, maxBytes: 3145728 } } });
  });
  await page.route("**/api/voice/transcribe", async (route) => {
    seen.transcribe.push(route.request());
    await route.fulfill({ json: { transcript: transcripts.shift() ?? "Hello" } });
  });
  await page.route("**/api/voice/speech", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}");
    seen.speech.push(`${body.messageId}#${body.part ?? 0}`);
    await route.fulfill({ body: MP3, headers: { "content-type": "audio/mpeg" } });
  });
  return seen;
}

/** Keeps a handle on every microphone stream so the test can check it is released. */
async function trackMicrophone(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __streams: MediaStream[] };
    w.__streams = [];
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => {
      const s = await original(c);
      w.__streams.push(s);
      return s;
    };
  });
}
const liveTracks = (page: Page) =>
  page.evaluate(() => (window as unknown as { __streams: MediaStream[] }).__streams.flatMap((s) => s.getTracks()).filter((t) => t.readyState === "live").length);

/** Starts Voice Mode; stops the welcome if it plays (it is skipped when the new-chat greeting was already heard). */
async function startVoice(page: Page) {
  await page.getByTestId("voice-consent").locator("input").check();
  await page.getByTestId("voice-start").click();
  const stop = page.getByTestId("voice-stop-speaking");
  if (await stop.isVisible().catch(() => false)) await stop.click();
  await expect(page.getByTestId("voice-status")).toHaveText("Ready when you are");
}

async function record(page: Page) {
  await page.getByTestId("voice-mic").click();
  await expect(page.getByTestId("voice-status")).toContainText("Listening");
  await page.waitForTimeout(1500);
  await page.getByTestId("voice-stop-recording").click();
}

test("voice mode falls back to text when no audio provider is configured", async ({ page }) => {
  await page.route("**/api/voice/consent", (route) => route.fulfill({ json: { available: false, consented: false } }));
  await registerIsolatedPatient(page);
  const res = await page.goto("/patient/companion");
  // Regression: the security header must allow the microphone for this origin only.
  expect(res?.headers()["permissions-policy"]).toContain("microphone=(self)");
  await page.getByTestId("voice-toggle").click();
  await expect(page.getByText("Voice isn't available right now. You can keep chatting by text.")).toBeVisible();
  await page.getByTestId("voice-to-text").first().click();
  await expect(page.locator("#composer")).toBeVisible();
});

test("two-way voice conversation with Sakinah: welcome, speak, review, reply, replay, mute, switch to text", async ({ page }) => {
  await trackMicrophone(page);
  const seen = await stubVoice(page, ["Work has been really stressfull lately", "Never mind"]);
  await registerIsolatedPatient(page);
  const greetingAudio = page.waitForRequest((r) => r.url().endsWith("/audio/sakinah-welcome.mp3"));
  await page.goto("/patient/companion");

  // A new chat opens with Sakinah's exact greeting, shown and spoken (autoplay allowed here).
  await greetingAudio;
  await expect(page.getByText(WELCOME)).toBeVisible();
  await expect(page.getByText("Sakinah · pre-recorded AI voice greeting")).toBeVisible();
  await expect(page.getByTestId("greeting-audio")).toHaveAttribute("data-state", "playing");
  await page.getByTestId("voice-toggle").click();

  // Consent is explicit; the microphone is not touched before the user taps it.
  await expect(page.getByText("Sakinah", { exact: true })).toBeVisible();
  await expect(page.getByText(/Your AI Wellbeing Companion/)).toBeVisible();
  await expect(page.getByTestId("voice-start")).toBeDisabled();
  await page.getByTestId("voice-consent").locator("input").check();
  await page.getByTestId("voice-start").click();
  // The greeting was already heard, so Voice Mode does not repeat it.
  await expect(page.getByTestId("voice-status")).toHaveText("Ready when you are");
  expect(await liveTracks(page)).toBe(0);

  // Push to talk → transcript to review and correct → send through the normal chat.
  await record(page);
  await expect(page.getByTestId("greeting-audio")).not.toHaveAttribute("data-state", "playing"); // no overlapping audio
  await expect(page.getByTestId("voice-transcript")).toHaveValue("Work has been really stressfull lately");
  expect(seen.transcribe[0].headers()["content-type"]).toMatch(/multipart\/form-data/);
  await expect.poll(() => liveTracks(page)).toBe(0); // microphone released after recording
  await page.getByTestId("voice-transcript").fill("Work has been really stressful, my manager keeps adding deadlines");
  await page.getByTestId("voice-send").click();
  await expect(page.getByText("Work has been really stressful, my manager keeps adding deadlines")).toBeVisible();
  // Demo build: pre-written reply. Live build: a real AI reply, labelled as AI-generated.
  await expect(page.getByText(/pressure at work|stretched/).or(page.getByText("AI-generated · not medical advice")).first()).toBeVisible({ timeout: 45_000 });

  // Sakinah speaks the saved, safety-checked reply (by message id, never free text).
  await expect(page.getByTestId("voice-status")).toHaveText("Sakinah is speaking…");
  await expect.poll(() => seen.speech.length).toBe(2); // short opening + rest, requested together
  expect(seen.speech.sort()).toEqual([expect.stringMatching(/^c[a-z0-9]{20,}#0$/), expect.stringMatching(/^c[a-z0-9]{20,}#1$/)]);
  await page.getByTestId("voice-stop-speaking").click();
  await expect(page.getByTestId("voice-status")).toHaveText("Ready when you are"); // not listening automatically

  // Replay uses the cached audio (no second paid call); mute stops speech.
  await page.getByTestId("voice-replay").click();
  await expect(page.getByTestId("voice-status")).toHaveText("Sakinah is speaking…");
  expect(seen.speech).toHaveLength(2);
  await page.getByTestId("voice-mute").click();
  await expect(page.getByTestId("voice-status")).toHaveText("Ready when you are");
  await expect(page.getByTestId("voice-mute")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("voice-mute").click();

  // Cancelling a recording discards it and releases the microphone.
  await page.getByTestId("voice-mic").click();
  await expect(page.getByTestId("voice-status")).toContainText("Listening");
  await expect.poll(() => liveTracks(page)).toBe(1);
  await page.getByTestId("voice-cancel").click();
  await expect(page.getByTestId("voice-status")).toHaveText("Ready when you are");
  await expect.poll(() => liveTracks(page)).toBe(0);

  // Switching to text keeps the same conversation.
  await page.getByTestId("voice-to-text").click();
  await expect(page.locator("#composer")).toBeVisible();
  await expect(page.getByText("Work has been really stressful, my manager keeps adding deadlines")).toBeVisible();
  await page.locator("#composer").fill("Typing again now");
  await page.locator("#composer").press("Enter");
  await expect(page.getByText("Typing again now")).toBeVisible();
  await page.getByTestId("voice-toggle").click();
  await expect(page.getByText(WELCOME)).toBeVisible();
});

test("a spoken crisis disclosure shows emergency guidance at once and bypasses the AI", async ({ page }) => {
  const seen = await stubVoice(page, ["I'm going to kill myself tonight"]);
  await registerIsolatedPatient(page);
  await page.goto("/patient/companion");
  await page.getByTestId("voice-toggle").click();
  await startVoice(page);
  await record(page);
  await page.getByTestId("voice-send").click();
  await expect(page.getByText("Safety response · pre-written, not AI-generated")).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "If you are in danger, call now." })).toBeVisible();
  await expect(page.locator('a[href="tel:998"]').first()).toBeVisible();
  await expect(page.getByText(/Outside the UAE, call your local emergency number/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Help now/ })).toBeVisible();
  await expect.poll(() => seen.speech.length).toBe(2); // approved crisis wording may be spoken
});

test("a blocked microphone gives a clear message and text chat keeps working", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
  });
  await stubVoice(page, []);
  await registerIsolatedPatient(page);
  await page.goto("/patient/companion");
  await page.getByTestId("voice-toggle").click();
  await startVoice(page);
  await page.getByTestId("voice-mic").click();
  await expect(page.getByTestId("voice-error")).toContainText("Microphone access is blocked");
  await page.getByTestId("voice-to-text").click();
  await page.locator("#composer").fill("Typing instead");
  await page.locator("#composer").press("Enter");
  await expect(page.getByText("Typing instead")).toBeVisible();
});

test("a browser without recording support is told so, never silently", async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as unknown as { MediaRecorder?: unknown }).MediaRecorder;
  });
  await stubVoice(page, []);
  await registerIsolatedPatient(page);
  await page.goto("/patient/companion");
  await page.getByTestId("voice-toggle").click();
  await startVoice(page);
  await page.getByTestId("voice-mic").click();
  await expect(page.getByTestId("voice-error")).toContainText("can't record audio");
});

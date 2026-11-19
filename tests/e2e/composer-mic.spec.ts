import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { deleteIsolatedPatient, registerIsolatedPatient } from "./support";

/**
 * Microphone beside the message box (fake microphone, synthetic speech). The two OpenAI-backed
 * voice endpoints are stubbed; the chat itself goes through the real, safety-checked route.
 */
test.use({
  permissions: ["microphone"],
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] },
});
test.afterEach(({ page }) => deleteIsolatedPatient(page));

const MP3 = readFileSync("public/audio/sakinah-welcome.mp3");

async function stubVoice(page: Page, transcript: string) {
  const seen = { speech: [] as string[], consentPosts: 0 };
  let consented = false;
  await page.route("**/api/voice/consent", async (route) => {
    if (route.request().method() === "POST") {
      consented = true;
      seen.consentPosts++;
    }
    await route.fulfill({ json: { available: true, consented } });
  });
  await page.route("**/api/voice/transcribe", (route) => route.fulfill({ json: { transcript } }));
  await page.route("**/api/voice/speech", async (route) => {
    const b = JSON.parse(route.request().postData() ?? "{}");
    seen.speech.push(`${b.messageId}#${b.part ?? 0}`);
    await route.fulfill({ body: MP3, headers: { "content-type": "audio/mpeg" } });
  });
  return seen;
}

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

test("microphone sits beside the message box, is accessible, and dictates into the same chat", async ({ page }) => {
  await trackMicrophone(page);
  const seen = await stubVoice(page, "Work has been really stressful lately");
  await registerIsolatedPatient(page);
  await page.goto("/patient/companion");

  // Discoverability: Sakinah's hint under the greeting (UI only).
  await expect(page.getByTestId("voice-hint")).toHaveText("Prefer talking instead of typing? Just tap the microphone beside the message box. I'm here to listen.");

  // Layout: [message box] [mic] [send], with a comfortable tap target.
  const box = await page.locator("#composer").boundingBox();
  const mic = page.getByRole("button", { name: "Speak your message" });
  const micBox = await mic.boundingBox();
  const sendBox = await page.getByRole("button", { name: "Send message" }).boundingBox();
  expect(micBox!.width).toBeGreaterThanOrEqual(44);
  expect(micBox!.height).toBeGreaterThanOrEqual(44);
  expect(micBox!.x).toBeGreaterThan(box!.x + box!.width - 1);
  expect(sendBox!.x).toBeGreaterThan(micBox!.x + micBox!.width - 1);
  expect(Math.abs(micBox!.y + micBox!.height - (sendBox!.y + sendBox!.height))).toBeLessThan(2);

  // First use asks for voice consent; the microphone stays off until the user agrees.
  await mic.click();
  await expect(page.getByTestId("composer-mic-consent")).toBeVisible();
  expect(await liveTracks(page)).toBe(0);
  await expect(page.getByTestId("composer-mic-agree")).toBeDisabled();
  await page.getByTestId("composer-mic-consent").locator("input").check();
  await page.getByTestId("composer-mic-agree").click();
  expect(seen.consentPosts).toBe(1);

  // Recording starts after consent; stop → transcript in the message box for review.
  await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible();
  await expect.poll(() => liveTracks(page)).toBe(1);
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.locator("#composer")).toHaveValue("Work has been really stressful lately");
  await expect(page.getByTestId("transcript-review-hint")).toBeVisible();
  await expect.poll(() => liveTracks(page)).toBe(0);

  // The user can correct it, then sends through the normal chat.
  await page.locator("#composer").fill("Work has been really stressful, my manager keeps adding deadlines");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Work has been really stressful, my manager keeps adding deadlines")).toBeVisible();
  await expect(page.getByText(/pressure at work|stretched/).or(page.getByText("AI-generated · not medical advice")).first()).toBeVisible({ timeout: 45_000 });

  // Sakinah's reply to a spoken message is read aloud, and can be replayed with Listen.
  await expect.poll(() => seen.speech.length).toBe(2);
  const listen = page.getByTestId("reply-listen").last();
  await expect(listen).toBeVisible();
  await expect(listen).toHaveText(/Stop/);
  await listen.click();
  await expect(listen).toHaveText(/Listen/);
  await listen.click();
  expect(seen.speech).toHaveLength(2); // cached: no second paid request

  // One conversation across text, the composer mic and Voice Mode.
  await page.getByTestId("voice-toggle").click();
  await expect(page.getByText("Work has been really stressful, my manager keeps adding deadlines")).toBeVisible();
  await expect(page.getByTestId("voice-mode")).toBeVisible();
});

test("cancelling a recording discards it and releases the microphone; errors offer a retry", async ({ page }) => {
  await trackMicrophone(page);
  await stubVoice(page, "unused");
  await page.route("**/api/voice/consent", (route) => route.fulfill({ json: { available: true, consented: true } }));
  await registerIsolatedPatient(page);
  await page.goto("/patient/companion");
  await page.getByRole("button", { name: "Speak your message" }).click();
  await expect.poll(() => liveTracks(page)).toBe(1);
  await page.getByTestId("composer-mic-cancel").click();
  await expect.poll(() => liveTracks(page)).toBe(0);
  await expect(page.locator("#composer")).toHaveValue("");

  // A recording that is too short gives a clear message and a retry.
  await page.getByRole("button", { name: "Speak your message" }).click();
  await page.getByRole("button", { name: "Stop recording" }).click();
  await expect(page.getByTestId("composer-mic-error")).toContainText("very short");
  await page.getByTestId("composer-mic-retry").click();
  await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible();
  await page.getByTestId("composer-mic-cancel").click();
});

test("a blocked microphone is explained and typing keeps working", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
  });
  await page.route("**/api/voice/consent", (route) => route.fulfill({ json: { available: true, consented: true } }));
  await registerIsolatedPatient(page);
  await page.goto("/patient/companion");
  await page.getByRole("button", { name: "Speak your message" }).click();
  await expect(page.getByTestId("composer-mic-error")).toContainText("Microphone access is blocked");
  await page.locator("#composer").fill("Typing instead");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Typing instead")).toBeVisible();
});

test("the message box, microphone and send button fit a narrow 320px phone screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await registerIsolatedPatient(page);
  await page.goto("/patient/companion");
  const send = await page.getByRole("button", { name: "Send message" }).boundingBox();
  const mic = await page.getByRole("button", { name: "Speak your message" }).boundingBox();
  const box = await page.locator("#composer").boundingBox();
  expect(send!.x + send!.width).toBeLessThanOrEqual(320);
  expect(mic!.width).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThan(120);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

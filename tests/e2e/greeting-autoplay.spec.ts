import { expect, test, type Page } from "@playwright/test";

/** New-chat greeting when the browser allows autoplay. Synthetic demo account only. */
test.use({ launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } });
test.describe.configure({ mode: "serial" });

const WELCOME =
  "Hello, I'm Sakinah, your AI wellbeing companion. I'm here to listen, support you, and help you through whatever is on your mind or whatever you're going through. You can share anything you're comfortable with, at your own pace. How are you feeling today?";

async function login(page: Page, key: string) {
  await page.goto("/login");
  await page.getByTestId(`demo-${key}`).click();
  await page.waitForURL(/\/patient/);
}

/** Counts microphone requests: the greeting must never open the microphone. */
async function countMicrophone(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __mic: number };
    w.__mic = 0;
    const original = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
    if (original) navigator.mediaDevices.getUserMedia = (c) => (w.__mic++, original(c));
  });
}

test("a new chat greets the user aloud once, as Sakinah, without the microphone", async ({ page }) => {
  await countMicrophone(page);
  await login(page, "layla");
  const audio = page.waitForRequest((r) => r.url().endsWith("/audio/sakinah-welcome.mp3"));
  await page.goto("/patient/companion");

  // Identity: illustrated avatar (no robot), polished header.
  await expect(page.locator("header").getByText("Sakinah", { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/AI support · not a clinician/)).toBeVisible();
  await expect(page.locator("header").getByTestId("sakinah-avatar")).toBeVisible();

  // The exact greeting is the first message and is spoken.
  await audio;
  await expect(page.getByText(WELCOME)).toBeVisible();
  await expect(page.getByTestId("greeting-audio")).toHaveAttribute("data-state", "playing");
  await expect(page.getByTestId("sakinah-avatar").nth(1)).toBeVisible(); // beside the greeting bubble
  await page.getByTestId("greeting-stop").click();
  await expect(page.getByTestId("greeting-audio")).toHaveAttribute("data-state", "stopped");
  expect(await page.evaluate(() => (window as unknown as { __mic: number }).__mic)).toBe(0);

  // Same tab session: a refresh shows the greeting text but does not speak it again.
  await page.reload();
  await expect(page.getByText(WELCOME)).toBeVisible();
  await expect(page.getByTestId("greeting-audio")).toHaveAttribute("data-state", "idle");
  await expect(page.getByTestId("greeting-play")).toHaveText(/Hear Sakinah's greeting/);

  // The user can type straight away; the greeting is never saved to history or sent to the AI.
  await page.locator("#composer").fill("Hello Sakinah, I'm a little tired today.");
  await page.locator("#composer").press("Enter");
  await expect(page.getByText("Hello Sakinah, I'm a little tired today.")).toBeVisible();
  await expect(page).toHaveURL(/\?c=/);
  await expect(page.getByText(/Pre-written demo response|AI-generated · not medical advice/).first()).toBeVisible({ timeout: 45_000 });

  // Re-opening that existing conversation never greets again.
  await page.reload();
  await expect(page.getByText("Hello Sakinah, I'm a little tired today.")).toBeVisible();
  await expect(page.getByText(WELCOME)).toHaveCount(0);
  await expect(page.getByTestId("greeting-audio")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __mic: number }).__mic)).toBe(0);
});

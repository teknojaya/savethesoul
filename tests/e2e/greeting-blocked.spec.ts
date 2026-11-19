import { expect, test, type Page } from "@playwright/test";

/** New-chat greeting when the browser blocks autoplay until the user taps (e.g. many phones). */
test.use({ launchOptions: { args: ["--autoplay-policy=document-user-activation-required"] } });
test.describe.configure({ mode: "serial" });

const WELCOME =
  "Hello, I'm Sakinah, your AI wellbeing companion. I'm here to listen, support you, and help you through whatever is on your mind or whatever you're going through. You can share anything you're comfortable with, at your own pace. How are you feeling today?";

/**
 * Mobile-style autoplay policy, emulated deterministically: play() is refused with
 * NotAllowedError unless it comes from a fresh user tap (headless Chromium is more lenient).
 */
async function blockAutoplay(page: Page) {
  await page.addInitScript(() => {
    let lastTap = 0;
    document.addEventListener("pointerdown", () => (lastTap = Date.now()), true);
    const original = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (Date.now() - lastTap > 1000) return Promise.reject(new DOMException("play() needs a user gesture", "NotAllowedError"));
      return original.call(this);
    };
  });
}

async function login(page: Page, key: string) {
  await page.goto("/login");
  await page.getByTestId(`demo-${key}`).click();
  await page.waitForURL(/\/patient/);
}

test("if autoplay is blocked, the greeting still shows and 'Tap to hear Sakinah' plays it", async ({ page }) => {
  await blockAutoplay(page);
  await login(page, "omar");
  await page.goto("/patient/companion"); // a fresh document with no tap yet: autoplay is blocked

  await expect(page.getByText(WELCOME)).toBeVisible();
  await expect(page.getByTestId("greeting-audio")).toHaveAttribute("data-state", "blocked");
  const tap = page.getByTestId("greeting-play");
  await expect(tap).toHaveText(/Tap to hear Sakinah/);
  await expect(page.locator("#composer")).toBeEnabled(); // typing works meanwhile

  await tap.click();
  await expect(page.getByTestId("greeting-audio")).toHaveAttribute("data-state", "playing");
  await page.getByTestId("greeting-stop").click();
  await expect(page.getByTestId("greeting-audio")).toHaveAttribute("data-state", "stopped");
});

test("if the greeting was never heard, Voice Mode's Start plays it (from the tap)", async ({ page }) => {
  await blockAutoplay(page);
  await page.route("**/api/voice/consent", (route) => route.fulfill({ json: { available: true, consented: false } }));
  await login(page, "omar");
  await page.goto("/patient/companion");
  await expect(page.getByTestId("greeting-audio")).toHaveAttribute("data-state", "blocked");
  await page.getByTestId("voice-toggle").click();
  await page.getByTestId("voice-consent").locator("input").check();
  await page.getByTestId("voice-start").click();
  await expect(page.getByTestId("voice-status")).toHaveText("Sakinah is speaking…");
  await expect(page.getByText(WELCOME)).toHaveCount(1); // the text is not duplicated
  await page.getByTestId("voice-stop-speaking").click();
  await expect(page.getByTestId("voice-status")).toHaveText("Ready when you are");
});

import { expect, test, type Page } from "@playwright/test";
import { deleteIsolatedPatient, registerIsolatedPatient, WELCOME } from "./support";

/** Greeting when the browser blocks autoplay until a tap (typical on phones). Isolated synthetic account. */
test.use({ launchOptions: { args: ["--autoplay-policy=document-user-activation-required"] } });
test.afterEach(({ page }) => deleteIsolatedPatient(page));

/** Mobile-style policy, emulated deterministically: play() only within 1 s of a tap on this page. */
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

test("if autoplay is blocked, the greeting shows at once with 'Tap to hear Sakinah'", async ({ page }) => {
  await blockAutoplay(page);
  await registerIsolatedPatient(page);
  await page.goto("/patient/companion");

  await expect(page.getByText(WELCOME)).toBeVisible();
  await expect(page.getByTestId("greeting-audio")).toHaveAttribute("data-state", "blocked");
  const tap = page.getByTestId("greeting-play");
  await expect(tap).toHaveText(/Tap to hear Sakinah/);
  await expect(page.locator("#composer")).toBeEnabled(); // typing works meanwhile

  await tap.click();
  await expect(page.getByTestId("greeting-audio")).toHaveAttribute("data-state", "playing");
  await page.getByTestId("greeting-stop").click();
  await expect(page.getByTestId("greeting-audio")).toHaveAttribute("data-state", "stopped");

  // A new conversation is opened by a tap, so its greeting can play straight away.
  await page.getByRole("button", { name: "Show conversation history" }).click();
  await page.getByRole("button", { name: "New conversation" }).click();
  await expect(page.getByTestId("greeting-audio")).toHaveAttribute("data-state", "playing");
});

test("if the greeting was never heard, Voice Mode's Start plays it (from the tap)", async ({ page }) => {
  await blockAutoplay(page);
  await page.route("**/api/voice/consent", (route) => route.fulfill({ json: { available: true, consented: false } }));
  await registerIsolatedPatient(page);
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

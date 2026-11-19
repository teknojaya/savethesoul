import { expect, test } from "@playwright/test";
import { countGreetingPlays, deleteIsolatedPatient, draftId, greetingPlays, registerIsolatedPatient, WELCOME } from "./support";

/** Greeting on every new chat when the browser allows autoplay. Isolated synthetic account. */
test.use({ launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } });
test.afterEach(({ page }) => deleteIsolatedPatient(page));

test("every new chat greets once (by conversation identity); refreshes and saved conversations do not", async ({ page }) => {
  await countGreetingPlays(page);
  await page.addInitScript(() => {
    const w = window as unknown as { __mic: number };
    w.__mic = 0;
    const original = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
    if (original) navigator.mediaDevices.getUserMedia = (c) => (w.__mic++, original(c));
  });
  await registerIsolatedPatient(page);

  // 1. A new chat: identity in the URL, the exact greeting shown and spoken exactly once (Strict Mode included).
  await page.goto("/patient/companion");
  await expect(page).toHaveURL(/\?new=d-/);
  const first = draftId(page);
  await expect(page.locator("header").getByText("Sakinah").first()).toBeVisible();
  await expect(page.getByText(/AI support · not a clinician|AI · not a clinician/)).toBeVisible();
  await expect(page.locator("header").getByTestId("sakinah-avatar")).toBeVisible();
  await expect(page.getByText(WELCOME)).toBeVisible();
  await expect(page.getByTestId("greeting-audio")).toHaveAttribute("data-state", "playing");
  await page.waitForTimeout(800);
  expect(await greetingPlays(page)).toBe(1);
  await page.getByTestId("greeting-stop").click();
  await expect(page.getByTestId("greeting-audio")).toHaveAttribute("data-state", "stopped");

  // 2. Refreshing the same chat keeps its identity and does not replay.
  await page.reload();
  expect(draftId(page)).toBe(first);
  await expect(page.getByText(WELCOME)).toBeVisible();
  await page.waitForTimeout(800);
  expect(await greetingPlays(page)).toBe(0);
  await expect(page.getByTestId("greeting-audio")).toHaveAttribute("data-state", "idle");
  await expect(page.getByTestId("greeting-play")).toHaveText(/Hear Sakinah's greeting/);

  // 3. "New conversation" creates a new chat identity, which greets once.
  await page.getByRole("button", { name: "Show conversation history" }).click();
  await page.getByRole("button", { name: "New conversation" }).click();
  await expect.poll(() => draftId(page)).not.toBe(first);
  const second = draftId(page);
  await expect(page.getByTestId("greeting-audio")).toHaveAttribute("data-state", "playing");
  expect(await greetingPlays(page)).toBe(1);
  await expect(page.getByText(WELCOME)).toHaveCount(1);

  // 4. Leaving and coming back to the companion opens another new chat, greeted once more.
  await page.goto("/patient");
  await page.getByRole("link", { name: /Start a conversation/ }).click();
  await expect(page).toHaveURL(/\?new=d-/);
  await expect.poll(() => draftId(page)).not.toBe(second);
  await expect(page.getByTestId("greeting-audio")).toHaveAttribute("data-state", "playing");

  // 5. Once a message is sent the chat is a saved conversation; revisiting it never greets.
  await page.locator("#composer").fill("Hello Sakinah, I'm a little tired today.");
  await page.locator("#composer").press("Enter");
  await expect(page).toHaveURL(/\?c=/);
  await expect(page.getByTestId("greeting-audio")).not.toHaveAttribute("data-state", "playing"); // typing stops the greeting
  await expect(page.getByText(/Pre-written demo response|AI-generated · not medical advice/).first()).toBeVisible({ timeout: 45_000 });
  await page.reload();
  await expect(page.getByText("Hello Sakinah, I'm a little tired today.")).toBeVisible();
  await expect(page.getByText(WELCOME)).toHaveCount(0);
  expect(await greetingPlays(page)).toBe(0);

  expect(await page.evaluate(() => (window as unknown as { __mic: number }).__mic)).toBe(0); // microphone never touched
});

import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "SaveTheSoul-demo-2026";

async function demoLogin(page: Page, key: string) {
  await page.goto("/login");
  await page.getByTestId(`demo-${key}`).click();
  await page.waitForURL(/\/(patient|clinician)/);
}

async function formLogin(page: Page, email: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/(patient|clinician)/);
}

async function sendChat(page: Page, text: string) {
  await page.locator("#composer").fill(text);
  await page.locator("#composer").press("Enter");
}

test.describe.configure({ mode: "serial" });

test("Help page works without signing in and shows real emergency numbers", async ({ page }) => {
  await page.goto("/help");
  await expect(page.getByRole("heading", { name: /don't have to face this alone/i })).toBeVisible();
  await expect(page.locator('a[href="tel:998"]').first()).toBeVisible();
  await expect(page.locator('a[href="tel:999"]').first()).toBeVisible();
  await expect(page.locator('a[href="tel:800725462"]').first()).toBeVisible();
  // The official helpline is clearly distinguished from the app's AI companion, Sakinah.
  await expect(page.getByTestId("sakina-line-note")).toContainText("separate service and is not part of SaveTheSoul or its AI companion, Sakinah");
});

test("Scenario 1 — everyday support, then a non-diagnostic WHO-5 result", async ({ page }) => {
  await demoLogin(page, "omar");
  await page.goto("/patient/companion");
  await expect(page.getByText(/AI support · not a clinician/)).toBeVisible();
  const demoCompanion = await page.getByText(/offline demo responses/).isVisible();
  await sendChat(page, "Work has been really stressful, my manager keeps adding deadlines");
  if (demoCompanion) {
    await expect(page.getByText(/pressure at work|stretched/)).toBeVisible();
    await expect(page.getByText("Pre-written demo response").first()).toBeVisible();
  } else {
    // Live model: the reply streams in, is labelled as AI, and is not the outage fallback.
    await expect(page.getByText("AI-generated · not medical advice").first()).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText("Safe fallback response")).toHaveCount(0);
    await expect(page.getByText("Pre-written demo response")).toHaveCount(0);
  }

  await page.goto("/patient/wellbeing/who5");
  await page.getByRole("button", { name: "See my result" }).click();
  await expect(page.getByText("Please answer questions 1, 2, 3, 4, 5.")).toBeVisible();
  const answers = ["Most of the time", "More than half of the time", "Most of the time", "Less than half of the time", "Most of the time"];
  const fieldsets = page.locator("fieldset");
  for (let i = 0; i < 5; i++) await fieldsets.nth(i).getByText(answers[i], { exact: true }).click();
  await page.getByRole("button", { name: "See my result" }).click();
  const result = page.getByTestId("who5-result");
  await expect(result).toContainText("68"); // (4+3+4+2+4)=17 ×4
  await expect(result).toContainText(/doesn't measure risk of self-harm/);
  await expect(result).not.toContainText(/you have depression/i);
});

test("Scenario 2 — declining wellbeing, approved summary shared and reviewed by clinician", async ({ page }) => {
  await demoLogin(page, "layla");
  await page.goto("/patient/wellbeing");
  await expect(page.getByText("Talking with a professional may help")).toBeVisible();
  const summary = page.getByTestId("wellbeing-summary");
  await expect(summary).toContainText("lower wellbeing");
  await expect(summary).toContainText("This is not a diagnosis.");
  await expect(summary.getByRole("link", { name: /Prepare a summary for my clinician/ })).toBeVisible();

  await page.goto("/patient/support/share");
  await page.getByText("Dr. Aisha Al Mansoori").click();
  await page.getByTestId("preview-summary").click();
  const preview = page.getByTestId("summary-preview");
  await expect(preview).toContainText("72 → ");
  await expect(preview).toContainText("Private AI companion conversations are never included");
  await expect(page.getByTestId("confirm-share")).toBeDisabled();
  await preview.getByRole("checkbox").check();
  await page.getByTestId("confirm-share").click();
  await expect(page.getByTestId("share-success")).toBeVisible();

  await page.context().clearCookies();
  await demoLogin(page, "dr.aisha");
  await page.goto("/clinician/patients");
  await page.getByTestId("patient-row").filter({ hasText: "Layla" }).click();
  await expect(page.getByRole("heading", { name: "Layla" })).toBeVisible();
  await expect(page.getByText(/Patient-approved summary/)).toBeVisible();
  const draft = page.getByTestId("ai-draft");
  await expect(page.getByTestId("ai-summary-label")).toContainText("review before clinical use");
  if (await draft.getByText("No AI draft is available").isVisible()) {
    // Offline demo build: no language model, so no AI draft is ever presented.
    await expect(draft.getByTestId("draft-approve")).toHaveCount(0);
  } else {
    await expect(draft).toContainText("Needs review");
    await page.getByTestId("draft-note").fill("Synthetic review note: consistent with WHO-5 data.");
    await page.getByTestId("draft-approve").click();
    await expect(draft).toContainText("Approved by clinician");
    await expect(page.getByTestId("review-note")).toContainText("Synthetic review note");
  }

  // Clinician-confirmed findings are separate from patient reports and AI observations.
  await page.getByTestId("finding-text").fill("Synthetic care plan: weekly check-in for four weeks.");
  await page.getByRole("button", { name: "Care plan" }).click();
  await page.getByTestId("finding-save").click();
  await expect(page.getByTestId("finding").first()).toContainText("Care plan · Dr. Aisha Al Mansoori");
});

test("Scenario 3 — urgent disclosure bypasses AI; failed hand-off without a care team", async ({ page }) => {
  await demoLogin(page, "omar");
  await page.goto("/patient/companion");
  await sendChat(page, "I'm going to kill myself tonight");
  const panel = page.getByTestId("crisis-panel");
  await expect(panel).toBeVisible();
  await expect(page.getByText("Safety response · pre-written, not AI-generated")).toBeVisible();
  await expect(panel.locator('a[href="tel:998"]')).toBeVisible();
  await page.getByTestId("send-sim-alert").click();
  await expect(page.getByTestId("handoff-failed")).toContainText("No care team is connected");
});

test("Scenario 3b — simulated care-team alert is acknowledged by the clinician", async ({ page }) => {
  await formLogin(page, "yousef@demo.savethesoul.app");
  await page.goto("/patient/companion");
  await sendChat(page, "I can't go on like this anymore");
  await expect(page.getByTestId("safety-check")).toBeVisible();
  await page.getByRole("button", { name: "I'm in danger right now" }).click();
  await expect(page.getByTestId("crisis-panel")).toBeVisible();
  await page.getByTestId("send-sim-alert").click();
  await expect(page.getByText(/Simulated alert sent to Dr. Aisha Al Mansoori/)).toBeVisible();

  const clinician = await page.context().browser()!.newContext();
  const cp = await clinician.newPage();
  await demoLogin(cp, "dr.aisha");
  await cp.goto("/clinician/safety");
  await cp.getByTestId("alert-row").filter({ hasText: "Yousef" }).getByTestId("acknowledge-alert").click();
  await expect(cp.getByTestId("alert-row").filter({ hasText: "Yousef" }).first()).toContainText("Acknowledged");
  await clinician.close();

  await expect(page.getByTestId("sim-ack")).toBeVisible({ timeout: 20_000 });
});

test("Scenario 4 — family support with preview, simulated send, and revocation", async ({ page }) => {
  await demoLogin(page, "omar");
  await page.goto("/patient/circle");
  await page.getByTestId("add-contact").click();
  await page.locator("#c-name").fill("Fatima");
  await page.locator("#c-rel").selectOption("Parent");
  await page.getByTestId("save-contact").click();
  const card = page.getByTestId("contact-card").filter({ hasText: "Fatima" });
  await expect(card).toBeVisible();

  await card.getByTestId("notify-contact").click();
  await page.getByTestId("preview-message").click();
  await expect(page.getByTestId("message-preview")).toContainText("Hi Fatima, Omar asked SaveTheSoul");
  await page.getByTestId("send-message").click();
  await expect(page.getByTestId("notify-result")).toContainText("Simulated message recorded");
  await expect(page.getByTestId("notification-row").first()).toContainText("Simulated send");

  // Revoke consent from Profile & Privacy
  await page.goto("/patient/privacy");
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("consent-row").filter({ hasText: "Share with trusted contact · Fatima" }).getByTestId("revoke-consent").click();
  await expect(page.getByTestId("consent-row").filter({ hasText: "Fatima" }).first()).toContainText("Revoked");

  await page.goto("/patient/circle");
  await page.getByTestId("contact-card").filter({ hasText: "Fatima" }).getByTestId("notify-contact").click();
  await page.getByTestId("preview-message").click();
  await expect(page.getByTestId("blocked-reason")).toContainText(/not active|revoked/);
  await page.getByTestId("send-message").click();
  await expect(page.getByTestId("notify-result")).toContainText("Blocked");
});

test("Scenario 5 — clinician acknowledges, schedules and completes follow-up", async ({ page }) => {
  await demoLogin(page, "dr.aisha");
  await page.goto("/clinician/referrals");
  const ref = page.getByTestId("clinician-referral").filter({ hasText: "Yousef" }).first();
  await ref.getByTestId("transition-ACKNOWLEDGED").click();
  await expect(ref.getByTestId("transition-SCHEDULED")).toBeVisible();
  await ref.getByTestId("transition-SCHEDULED").click();
  await expect(ref.getByTestId("transition-COMPLETED")).toBeVisible();

  await page.goto("/clinician/follow-ups");
  const row = page.getByTestId("follow-up-row").filter({ hasText: "Yousef" });
  await row.locator("select").selectOption("1");
  await row.getByTestId("complete-follow-up").click();
  await expect(row).toContainText("completed");

  await page.goto("/clinician/outcomes");
  await expect(page.getByText("Median time to first contact")).toBeVisible();
  await expect(page.getByText("Fairness monitoring framework")).toBeVisible();
});

test("Clinician cannot open a patient outside their caseload", async ({ page }) => {
  await demoLogin(page, "dr.james");
  await page.goto("/clinician/patients");
  await expect(page.getByTestId("patient-row")).toHaveCount(1);
  await expect(page.getByTestId("patient-row")).toContainText("Daniel");
  const res = await page.request.get("/api/clinician/patients");
  const { patients } = await res.json();
  expect(patients.map((p: { preferredName: string }) => p.preferredName)).toEqual(["Daniel"]);
});

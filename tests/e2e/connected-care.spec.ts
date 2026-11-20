import { expect, test, type Page } from "@playwright/test";
import { deleteIsolatedPatient, deleteSharedPatient, registerIsolatedPatient } from "./support";

/** Role cards, the simulated hospital emergency portal, fictional clinician records, and Explore. Synthetic data only. */
async function demoLogin(page: Page, key: string, portal: RegExp) {
  await page.goto("/login");
  await page.getByTestId(`demo-${key}`).click();
  await page.waitForURL(portal);
}

test.describe.configure({ mode: "serial" });

test("Sign-in offers Patient, Clinician and Hospital Emergency demo role cards (no passwords in the page)", async ({ page }) => {
  await page.goto("/login");
  const roles = page.getByTestId("demo-roles");
  for (const t of ["Patient Demo", "Clinician Demo", "Hospital Emergency Demo"]) await expect(roles.getByText(t, { exact: true })).toBeVisible();
  expect(await page.content()).not.toContain("SaveTheSoul-demo-2026");
});

test("Hospital coordinator: simulated banner, own-organisation cases, acknowledge, and consent-checked family notification", async ({ page }) => {
  await demoLogin(page, "coordinator", /\/hospital/);
  await expect(page.getByTestId("case-counters")).toBeVisible();
  await page.getByTestId("case-row").filter({ hasText: "ER-1001" }).click();
  await page.waitForURL(/\/hospital\/cases\//);
  await expect(page.getByTestId("case-status")).toContainText("Awaiting human review");
  await expect(page.getByTestId("case-context")).not.toContainText(/conversation:|chat transcript/i);

  await page.getByTestId("case-note").fill("Synthetic: reviewed by demo coordinator.");
  await page.getByTestId("case-action-ACKNOWLEDGED").click();
  await expect(page.getByTestId("case-status")).toContainText("Acknowledged");
  await expect(page.getByTestId("case-timeline")).toContainText("Synthetic: reviewed by demo coordinator.");

  const family = page.getByTestId("family-panel");
  await expect(family).toContainText("Mariam");
  await family.getByTestId("family-notify").first().click();
  await expect(page.getByTestId("case-timeline")).toContainText(/Safety-plan notification to Mariam/);

  await page.getByTestId("case-action-CONTACT_ATTEMPTED").click();
  await expect(page.getByTestId("case-status")).toContainText("Contact attempted");

  await page.goto("/hospital/audit");
  await expect(page.getByTestId("audit-table")).toContainText("emergency case acknowledged");
});

test("Sakinah AI-detected indirect warning signs reach the hospital with a risk report, location and contacts", async ({ page }) => {
  await demoLogin(page, "coordinator", /\/hospital/);
  const alert = page.getByTestId("ai-alert");
  await expect(alert).toContainText("Sakinah AI risk alert");
  await alert.click();
  await page.waitForURL(/\/hospital\/cases\//);
  await expect(page.getByTestId("ai-alert-banner")).toBeVisible();
  await expect(page.getByTestId("case-context")).toContainText("Sakinah AI risk report");
  await expect(page.getByTestId("case-context")).toContainText("Emergency contact: Huda");
  await expect(page.getByText("Al Reem Island").first()).toBeVisible();
  await expect(page.getByTestId("case-timeline")).toContainText("Sakinah AI detected warning signs");
  await expect(page.getByTestId("case-map")).toBeVisible();
  await expect(page.getByTestId("case-coordinates")).toHaveText("24.49900,54.40600");
  await expect(page.getByTestId("map-directions")).toHaveAttribute("href", /google\.com\/maps\/dir\/\?api=1&destination=24\.49900,54\.40600/);
  await page.getByTestId("case-action-ACKNOWLEDGED").click();
  await expect(page.getByTestId("ai-alert-banner")).toHaveCount(0);
});

test("Hospital coordinator cannot open patient or clinician areas", async ({ page }) => {
  await demoLogin(page, "coordinator", /\/hospital/);
  expect((await page.request.get("/api/clinician/patients")).status()).toBe(403);
  await page.goto("/clinician");
  await expect(page).toHaveURL(/\/hospital/);
});

test("Clinician sees the fictional clinician-authored diagnosis separated from AI and patient-reported information", async ({ page }) => {
  await demoLogin(page, "dr.aisha", /\/clinician/);
  await page.goto("/clinician/patients");
  await page.getByTestId("patient-row").filter({ hasText: "Hana" }).click();
  await expect(page.getByText("A · Patient-reported information")).toBeVisible();
  await expect(page.getByText("B · AI preliminary assessment")).toBeVisible();
  await expect(page.getByText("C · Clinician-confirmed findings")).toBeVisible();
  await expect(page.getByTestId("finding").filter({ hasText: "Generalized Anxiety Disorder" })).toContainText("Dr. Aisha Al Mansoori");
  // Hana chose to share her conversations with Dr. Aisha (explicit, revocable consent).
  await expect(page.getByTestId("shared-conversations")).toContainText("Worry keeping me up at night");
  await expect(page.getByTestId("shared-conversation").first()).toContainText("I can't switch my brain off at night");
});

test.describe("Explore My Mental Wellbeing", () => {
  test.afterEach(async ({ page }) => deleteIsolatedPatient(page));
  test.afterAll(async ({ browser }, info) => deleteSharedPatient(browser, info.project.use.baseURL));

  test("consent first, structured questions, labelled preliminary result, then a patient-controlled share", async ({ page }) => {
    await registerIsolatedPatient(page, "Rania");
    await page.goto("/patient/wellbeing");
    await page.getByTestId("explore-entry").click();
    await expect(page.getByTestId("explore-run")).toHaveCount(0); // nothing before consent
    await page.getByTestId("explore-consent").locator("input").check();
    const sets = page.locator("fieldset");
    for (let i = 0; i < 6; i++) await sets.nth(i).getByRole("button").first().click();
    await page.getByTestId("explore-run").click();
    await expect(page.getByTestId("explore-result")).toBeVisible();
    await expect(page.getByTestId("explore-label")).toContainText("Preliminary AI-generated clinical impression — not a confirmed diagnosis. Requires professional assessment.");
    // Offline demo build: no language model, so nothing is presented as AI output.
    if (await page.getByTestId("explore-no-ai").isVisible()) await expect(page.getByTestId("explore-ai")).toHaveCount(0);
    else await expect(page.getByTestId("explore-ai")).toBeVisible();

    await page.getByTestId("explore-prepare-summary").click();
    await expect(page).toHaveURL(/\/patient\/support\/share\?from=explore/);
    // Conversations are off by default; ticking them shows a clear warning.
    await expect(page.getByTestId("share-cat-CONVERSATIONS")).not.toBeChecked();
    await page.getByTestId("share-cat-CONVERSATIONS").check();
    await expect(page.getByTestId("conversations-warning")).toContainText("full conversation history");
  });

  test("words that indicate danger get safety guidance instead of an assessment", async ({ page }) => {
    await registerIsolatedPatient(page, "Rania");
    await page.goto("/patient/wellbeing/explore");
    await page.getByTestId("explore-consent").locator("input").check();
    const sets = page.locator("fieldset");
    for (let i = 0; i < 6; i++) await sets.nth(i).getByRole("button").first().click();
    await page.locator("#own-words").fill("I'm going to kill myself tonight");
    await page.getByTestId("explore-run").click();
    await expect(page.getByTestId("explore-safety")).toBeVisible();
    await expect(page.getByTestId("explore-safety").locator('a[href="tel:998"]').first()).toBeVisible();
    await expect(page.getByTestId("explore-result")).toHaveCount(0);
  });
});

test.describe("Clinical Intelligence (consent-gated)", () => {
  test.afterEach(async ({ page }) => deleteIsolatedPatient(page));
  test.afterAll(async ({ browser }, info) => deleteSharedPatient(browser, info.project.use.baseURL));

  test("a new patient sees the explicit permission, can decline and keep chatting, or allow and withdraw", async ({ page }) => {
    await registerIsolatedPatient(page, "Rania");
    await page.goto("/patient/wellbeing");
    await page.getByTestId("insights-entry").click();
    await expect(page.getByTestId("ci-consent")).toContainText("Allow Sakinah to help understand my wellbeing");
    await expect(page.getByTestId("ci-consent")).toContainText("These insights are not a medical diagnosis");
    await expect(page.getByTestId("ci-insights")).toHaveCount(0);
    await page.getByTestId("ci-decline").click();
    await expect(page).toHaveURL(/\/patient\/companion/);
    await page.goto("/patient/wellbeing/insights");
    await page.getByTestId("ci-enable").click();
    await expect(page.getByTestId("ci-consent")).toContainText("Only messages you send from that moment are analysed");
    await page.getByTestId("ci-withdraw").click();
    await expect(page.getByTestId("ci-enable")).toBeVisible();
  });
});

test("Clinician sets a follow-up goal; the patient chooses whether Sakinah may use it", async ({ page, browser }) => {
  await demoLogin(page, "dr.aisha", /\/clinician/);
  await page.goto("/clinician/patients");
  await page.getByTestId("patient-row").filter({ hasText: "Hana" }).click();
  await page.getByTestId("clinician-goal-input").fill("Keep a regular evening wind-down routine");
  await page.getByTestId("clinician-goal-add").click();
  await expect(page.getByTestId("clinician-goal").first()).toContainText("Keep a regular evening wind-down routine");

  const ctx = await browser.newContext();
  const hana = await ctx.newPage();
  await hana.goto("/login");
  await hana.locator("#email").fill("hana@demo.savethesoul.app");
  await hana.locator("#password").fill("SaveTheSoul-demo-2026");
  await hana.getByRole("button", { name: "Sign in", exact: true }).click();
  await hana.waitForURL(/\/patient/);
  await hana.goto("/patient/wellbeing/insights");
  await expect(hana.getByTestId("ci-clinician-goal").first()).toContainText("from Dr. Aisha Al Mansoori");
  await hana.getByTestId("ci-careplan-on").click();
  await expect(hana.getByTestId("ci-careplan-off")).toBeVisible();
  await ctx.close();
});

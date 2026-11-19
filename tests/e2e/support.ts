import { expect, type Browser, type Page } from "@playwright/test";

/**
 * E2E_REUSE_ACCOUNTS=1 (production runs): one synthetic account per spec file instead of one per
 * test, to stay within the production sign-up limit. Tests sign in to it; afterAll deletes it.
 */
const REUSE = !!process.env.E2E_REUSE_ACCOUNTS;
const PASSWORD = "E2e-synthetic-2026x";
let shared: string | null = null;

export const WELCOME =
  "Hello, I'm Sakinah, your AI wellbeing companion. I'm here to listen, support you, and help you through whatever is on your mind or whatever you're going through. You can share anything you're comfortable with, at your own pace. How are you feeling today?";

/**
 * Registers a fresh synthetic patient for one test (no shared demo data is touched).
 * Pair with deleteIsolatedPatient() in afterEach: account deletion removes everything it created.
 */
export async function registerIsolatedPatient(page: Page, preferredName = "Sam") {
  if (REUSE && shared) {
    const login = await page.request.post("/api/auth/login", { data: { email: shared, password: PASSWORD } });
    expect(login.status(), await login.text()).toBe(200);
    return shared;
  }
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const reg = await page.request.post("/api/auth/register", { data: { email, password: PASSWORD, preferredName, acceptTerms: true } });
  expect(reg.status(), await reg.text()).toBe(201);
  const onboard = await page.request.post("/api/onboarding", { data: { aiProcessing: true, chatHistoryEnabled: true, memoryEnabled: false, aggregateAnalytics: false } });
  expect(onboard.ok()).toBeTruthy();
  if (REUSE) shared = email;
  return email;
}

export async function deleteIsolatedPatient(page: Page) {
  if (REUSE) return; // deleted once in deleteSharedPatient()
  const res = await page.request.post("/api/privacy/delete-account", { data: { confirmation: "DELETE" } });
  expect([200, 401]).toContain(res.status()); // 401: already deleted or never signed in
}

/** Counts plays of Sakinah's recorded greeting in the current document. */
export async function countGreetingPlays(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __greetPlays: number };
    w.__greetPlays = 0;
    const original = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (this.src.includes("sakinah-welcome")) w.__greetPlays++;
      return original.call(this);
    };
  });
}
export const greetingPlays = (page: Page) => page.evaluate(() => (window as unknown as { __greetPlays: number }).__greetPlays);
export const draftId = (page: Page) => new URL(page.url()).searchParams.get("new");

/** afterAll (reuse mode): sign in to the shared synthetic account and delete it with everything it created. */
export async function deleteSharedPatient(browser: Browser, baseURL: string | undefined) {
  if (!REUSE || !shared) return;
  const ctx = await browser.newContext({ baseURL });
  try {
    const login = await ctx.request.post("/api/auth/login", { data: { email: shared, password: PASSWORD } });
    expect(login.status()).toBe(200);
    const del = await ctx.request.post("/api/privacy/delete-account", { data: { confirmation: "DELETE" } });
    expect(del.status()).toBe(200);
  } finally {
    shared = null;
    await ctx.close();
  }
}

import { chromium, devices } from "@playwright/test";
const BASE = "https://savethesoul-web-production.up.railway.app";
const OUT = process.argv[2];
const b = await chromium.launch();
for (const [name, opts] of [["mobile", devices["Pixel 7"]], ["desktop", { viewport: { width: 1440, height: 900 } }]]) {
  const ctx = await b.newContext(opts); const p = await ctx.newPage();
  const issues = []; const links = new Set();
  p.on("pageerror", (e) => issues.push(`pageerror: ${e.message.slice(0, 150)}`));
  p.on("console", (m) => m.type() === "error" && issues.push(`console: ${m.text().slice(0, 150)}`));
  p.on("response", (r) => r.status() >= 400 && r.url().startsWith(BASE) && issues.push(`HTTP ${r.status()} ${r.url().replace(BASE, "")}`));
  const shot = async (s) => { await p.waitForTimeout(400); await p.screenshot({ path: `${OUT}/${name}-${s}.png`, fullPage: true }); };
  const collect = async () => (await p.$$eval("a[href^='/']", (as) => as.map((a) => a.getAttribute("href")))).forEach((h) => links.add(h.split("#")[0]));
  const step = (s) => console.log(`[${name}] ${s}`);
  try {
    await p.goto(BASE + "/"); await shot("01-landing"); await collect();
    await p.getByRole("link", { name: /get started/i }).first().click(); await p.waitForURL(/register/); await shot("02-register");
    const email = `uat-${name}-${Date.now()}@example.com`;
    await p.locator("#name").fill("Sam"); await p.locator("#email").fill(email); await p.locator("#password").fill("Uat-test-2026x");
    await p.locator("input[type=checkbox]").check(); await p.getByRole("button", { name: "Create account" }).click();
    await p.waitForURL(/onboarding/); step("registered → onboarding"); await shot("03-onboarding-1");
    await p.getByRole("button", { name: /continue/i }).click(); await shot("04-onboarding-2-privacy");
    if (name === "desktop") await p.getByText("Personal wellbeing memory").click();
    await p.getByRole("button", { name: /continue/i }).click(); await shot("05-onboarding-3");
    await p.getByRole("button", { name: /let's begin/i }).click(); await p.waitForURL(/\/patient/); step(`onboarded → ${p.url().replace(BASE, "")}`);
    await shot("06-dashboard"); await collect();
    await p.goto(BASE + "/patient/companion"); await shot("07-companion-empty"); await collect();
    const t0 = Date.now();
    await p.locator("#composer").fill("Hi, I've been feeling stressed about exams and can't sleep well."); await p.locator("#composer").press("Enter");
    await p.getByText("AI-generated · not medical advice").first().waitFor({ timeout: 45000 }); step(`AI reply in ${Date.now() - t0} ms`);
    await p.locator("#composer").fill("What could I try tonight?"); await p.locator("#composer").press("Enter");
    await p.getByText("AI-generated · not medical advice").nth(1).waitFor({ timeout: 45000 }); await shot("08-companion-chat");
    await p.goto(BASE + "/patient/wellbeing"); await shot("09-wellbeing"); await collect();
    await p.goto(BASE + "/patient/wellbeing/who5");
    const ans = ["Most of the time", "More than half of the time", "Most of the time", "Less than half of the time", "Most of the time"];
    for (let i = 0; i < 5; i++) await p.locator("fieldset").nth(i).getByText(ans[i], { exact: true }).click();
    await p.getByRole("button", { name: "See my result" }).click(); await p.getByTestId("who5-result").waitFor(); await shot("10-who5-result");
    for (const path of ["/patient/support", "/patient/circle", "/patient/privacy", "/help", "/privacy-notice"]) { await p.goto(BASE + path); await shot(`11${path.replaceAll("/", "_")}`); await collect(); }
    const bad = [];
    for (const l of links) { if (l.includes("logout")) continue; const r = await p.request.get(BASE + l); if (r.status() >= 400) bad.push(`${r.status()} ${l}`); }
    step(`checked ${links.size} internal links; broken: ${bad.length ? bad.join(", ") : "none"}`);
    const del = await p.request.post(BASE + "/api/privacy/delete-account", { data: { confirmation: "DELETE" } }); step(`cleanup delete-account: ${del.status()}`);
  } catch (e) { step(`FAILED at ${p.url().replace(BASE, "")}: ${e.message.split("\n")[0]}`); await shot("99-failure"); }
  step(`issues: ${issues.length ? "\n  " + [...new Set(issues)].join("\n  ") : "none"}`);
  await ctx.close();
}
await b.close();

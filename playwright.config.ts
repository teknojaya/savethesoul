import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests run the five judge demo scenarios against an isolated, freshly seeded
 * database (savethesoul_e2e) and a dedicated server on port 3200.
 */
const PORT = 3200;
const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgresql://sts:sts_dev_password@localhost:5433/savethesoul_e2e?schema=public";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `pnpm next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: E2E_DB,
      DEMO_MODE: "true",
      LLM_PROVIDER: "demo",
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
});

/**
 * Integration tests run against a dedicated database (never the demo DB).
 * Set TEST_DATABASE_URL, or the default local docker test database is used.
 */
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://sts:sts_dev_password@localhost:5433/savethesoul_test?schema=public";
if (!/test/.test(process.env.DATABASE_URL)) {
  throw new Error("Refusing to run integration tests against a database whose name does not contain 'test'");
}
process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
process.env.DEMO_MODE = "true";
process.env.LLM_PROVIDER = "demo";
process.env.LLM_TIMEOUT_MS = "5000";

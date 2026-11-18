import { execSync } from "node:child_process";

export default function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? "postgresql://sts:sts_dev_password@localhost:5433/savethesoul_e2e?schema=public";
  if (!/e2e|test/.test(url)) throw new Error("Refusing to seed a non-test database for E2E");
  const env = { ...process.env, DATABASE_URL: url };
  execSync("pnpm prisma migrate deploy", { env, stdio: "inherit" });
  execSync("pnpm tsx prisma/seed.ts", { env, stdio: "inherit" });
}

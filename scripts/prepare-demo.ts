/**
 * Targeted, idempotent, NON-DESTRUCTIVE preparation of the hackathon demo records
 * (fictional clinical cases and simulated hospital emergency cases). Never deletes or overwrites:
 * each item is created only if missing, and every created entity is printed.
 *
 *   railway ssh -s savethesoul-web -- pnpm exec tsx scripts/prepare-demo.ts
 */
import "dotenv/config";
import { prepareDemo } from "../src/server/demo/prepare-demo";
import { prisma } from "../src/lib/db/prisma";

async function main() {
  const report = await prepareDemo();
  console.log(`Created (${report.created.length}):`);
  for (const c of report.created) console.log(`  + ${c}`);
  console.log(`Skipped, already present (${report.skipped.length}):`);
  for (const c of report.skipped) console.log(`  = ${c}`);
}

main()
  .catch((e) => {
    console.error("prepare-demo failed:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

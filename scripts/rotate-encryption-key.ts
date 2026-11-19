/**
 * Re-encrypts every `*Enc` column from the current key to a new key, in one transaction.
 *
 *   DATA_ENCRYPTION_KEY=<current> NEW_DATA_ENCRYPTION_KEY=<new> pnpm exec tsx scripts/rotate-encryption-key.ts [--apply]
 *
 * - Without --apply it is a dry run: it decrypts every value with the current key and
 *   reports counts, proving the current key is correct before anything changes.
 * - With --apply it rewrites all values in a single transaction (all or nothing), then
 *   re-reads them with the new key to verify. Switch DATA_ENCRYPTION_KEY to the new key
 *   in the environment only after it reports success.
 * - Prints table/column names and counts only — never keys or decrypted values.
 *
 * Production: take a database backup first and keep the old key until the new one is
 * verified in the running app. Stop writes (or scale to zero) during the rotation.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Client } from "pg";

function key(name: string): Buffer {
  const raw = process.env[name];
  if (!raw) throw new Error(`${name} is not set`);
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error(`${name} must be 32 bytes encoded as base64`);
  return k;
}

function decryptWith(k: Buffer, payload: string): string {
  const [v, iv, tag, ct] = payload.split(":");
  if (v !== "v1" || !iv || !tag || ct === undefined) throw new Error("Unsupported ciphertext format");
  const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
}

function encryptWith(k: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), ct.toString("base64")].join(":");
}

const quote = (id: string) => `"${id.replace(/"/g, '""')}"`;

async function main() {
  const apply = process.argv.includes("--apply");
  const oldKey = key("DATA_ENCRYPTION_KEY");
  const newKey = key("NEW_DATA_ENCRYPTION_KEY");
  if (oldKey.equals(newKey)) throw new Error("The new key must differ from the current key");

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const { rows: cols } = await db.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns
       where table_schema = 'public' and column_name like '%Enc' and data_type = 'text' order by 1, 2`,
    );
    await db.query("BEGIN");
    let total = 0;
    for (const { table_name: t, column_name: c } of cols) {
      const { rows } = await db.query<{ id: string; v: string }>(`select id, ${quote(c)} as v from ${quote(t)} where ${quote(c)} is not null`);
      for (const r of rows) {
        const plain = decryptWith(oldKey, r.v); // throws (and rolls back) if the current key is wrong
        if (apply) await db.query(`update ${quote(t)} set ${quote(c)} = $1 where id = $2`, [encryptWith(newKey, plain), r.id]);
      }
      total += rows.length;
      console.log(`${t}.${c}: ${rows.length}`);
    }
    if (!apply) {
      await db.query("ROLLBACK");
      console.log(`Dry run OK: ${total} values decrypt with the current key. Re-run with --apply to rotate.`);
      return;
    }
    // Verify inside the transaction before committing.
    for (const { table_name: t, column_name: c } of cols) {
      const { rows } = await db.query<{ v: string }>(`select ${quote(c)} as v from ${quote(t)} where ${quote(c)} is not null`);
      for (const r of rows) decryptWith(newKey, r.v);
    }
    await db.query("COMMIT");
    console.log(`Rotated and verified ${total} values. Now set DATA_ENCRYPTION_KEY to the new key.`);
  } catch (e) {
    await db.query("ROLLBACK").catch(() => {});
    console.error("Rotation aborted, nothing changed:", e instanceof Error ? e.message : "unknown error");
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

main();

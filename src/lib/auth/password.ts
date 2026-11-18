import bcrypt from "bcryptjs";

const COST = 11;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

let dummyHash: string | null = null;
/** A real bcrypt hash used to equalise timing when an account does not exist. */
export function getDummyHash(): string {
  dummyHash ??= bcrypt.hashSync("timing-equaliser-not-a-password", COST);
  return dummyHash;
}

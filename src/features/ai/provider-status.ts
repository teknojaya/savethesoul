/**
 * In-process record of real model outcomes, used by /api/health to report whether the
 * configured provider has actually worked. A key being present is never treated as proof:
 * the status is "verified" only after a real authenticated request returned text.
 * Stores timestamps and error codes only — never prompts, replies or error details.
 */
interface Outcome {
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastFailureCode: string | null;
}

const outcomes = new Map<string, Outcome>();

function get(key: string): Outcome {
  let o = outcomes.get(key);
  if (!o) outcomes.set(key, (o = { lastSuccessAt: null, lastFailureAt: null, lastFailureCode: null }));
  return o;
}

export function recordProviderSuccess(providerId: string, model: string) {
  get(`${providerId}:${model}`).lastSuccessAt = Date.now();
}

export function recordProviderFailure(providerId: string, model: string, code: string) {
  const o = get(`${providerId}:${model}`);
  o.lastFailureAt = Date.now();
  o.lastFailureCode = code;
}

export type LiveStatus = "configured_untested" | "verified" | "unavailable";

export function liveStatus(providerId: string, model: string): { status: LiveStatus; lastSuccessAt: string | null; lastFailureCode: string | null } {
  const o = outcomes.get(`${providerId}:${model}`);
  if (!o || (o.lastSuccessAt === null && o.lastFailureAt === null)) return { status: "configured_untested", lastSuccessAt: null, lastFailureCode: null };
  const failedLast = o.lastFailureAt !== null && (o.lastSuccessAt === null || o.lastFailureAt > o.lastSuccessAt);
  return {
    status: failedLast ? "unavailable" : "verified",
    lastSuccessAt: o.lastSuccessAt ? new Date(o.lastSuccessAt).toISOString() : null,
    lastFailureCode: failedLast ? o.lastFailureCode : null,
  };
}

export function resetProviderStatus() {
  outcomes.clear();
}

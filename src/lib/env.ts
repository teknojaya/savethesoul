import { z } from "zod";

/**
 * Server-side environment, validated once. Never import this from client components:
 * none of these values may reach the browser.
 */
const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATA_ENCRYPTION_KEY: z.string().min(1, "DATA_ENCRYPTION_KEY is required"),
  DEMO_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  LLM_PROVIDER: z.enum(["auto", "openai", "anthropic", "demo"]).default("auto"),
  /** Model id for the selected provider; each provider has its own default when unset. */
  LLM_MODEL: z.string().trim().optional().transform((v) => v || undefined),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // Report variable names only — never values.
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid server environment: ${names}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test helper: clear memoised env after mutating process.env. */
export function resetEnvCache() {
  cached = null;
}

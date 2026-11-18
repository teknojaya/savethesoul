// Deterministic test key — never used outside tests.
process.env.DATA_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.DATABASE_URL ??= "postgresql://unused:unused@localhost:1/unused";
process.env.DEMO_MODE ??= "true";
process.env.LLM_PROVIDER = "demo";

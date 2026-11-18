import { prisma } from "@/lib/db/prisma";
import { SUPPORT_RESOURCES } from "@/features/safety/resources";

/**
 * Support directory. Falls back to the static, verified list if the database is
 * unreachable, so care navigation keeps working during an outage.
 */
export async function listSupportResources() {
  try {
    const rows = await prisma.supportResource.findMany({ orderBy: { sortOrder: "asc" } });
    // Dialable numbers always come from the verified static list (never parsed from display text).
    const dialBySlug = new Map(SUPPORT_RESOURCES.map((r) => [r.slug, r.dial ?? null]));
    if (rows.length) return rows.map((r) => ({ ...r, dial: dialBySlug.get(r.slug) ?? null }));
  } catch {
    console.error("[resources] database unavailable — serving static directory");
  }
  return SUPPORT_RESOURCES.map((r, i) => ({
    id: `static-${i}`,
    ...r,
    phone: r.phone ?? null,
    website: r.website ?? null,
    hours: r.hours ?? null,
    languages: r.languages ?? null,
    eligibility: r.eligibility ?? null,
    verificationNote: r.verificationNote ?? null,
    sourceUrl: r.sourceUrl ?? null,
    verifiedAt: r.verifiedAt ? new Date(r.verifiedAt) : null,
    region: "Abu Dhabi",
    dial: r.dial ?? null,
  }));
}

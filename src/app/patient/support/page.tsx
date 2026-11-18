import Link from "next/link";
import { Phone, Globe, ShieldCheck, ShieldQuestion, BadgeCheck, Send } from "lucide-react";
import { requirePatientPage } from "@/lib/auth/current-user";
import { getEnv } from "@/lib/env";
import { listSupportResources } from "@/server/services/resource.service";
import { listPatientReferrals } from "@/server/services/referral.service";
import { listShareableClinicians } from "@/server/services/summary.service";
import { Badge, Card, PageHeader } from "@/components/ui/primitives";
import { buttonVariants } from "@/components/ui/button";
import { ReferralList, RequestReferral } from "@/components/referrals/patient-referrals";

export const metadata = { title: "Find Support" };

const LEVELS: { key: string; title: string; description: string }[] = [
  { key: "EMERGENCY", title: "Emergency — immediate danger", description: "If you or someone else might be harmed right now." },
  { key: "CRISIS_LINE", title: "Talk to someone now", description: "Free, confidential support lines staffed by trained people." },
  { key: "PRIMARY_CARE", title: "Primary healthcare", description: "A good first step for ongoing concerns — your family doctor can assess and refer." },
  { key: "PSYCHIATRIC_SPECIALIST", title: "Specialist mental health", description: "Psychiatry and psychology services, usually via referral." },
  { key: "TELE_MENTAL_HEALTH", title: "Tele-mental health", description: "Video consultations with licensed professionals." },
  { key: "COMMUNITY", title: "Community & government support", description: "Helplines and services for wellbeing and safety." },
  { key: "SELF_HELP", title: "Self-help", description: "Evidence-informed exercises you can do now." },
];

function Verification({ status }: { status: string }) {
  if (status === "VERIFIED_OFFICIAL")
    return <Badge tone="sage"><BadgeCheck className="size-3" aria-hidden /> Verified · official source</Badge>;
  if (status === "VERIFIED_SECONDARY")
    return <Badge tone="sky"><ShieldCheck className="size-3" aria-hidden /> Verified · secondary source</Badge>;
  return <Badge tone="amber"><ShieldQuestion className="size-3" aria-hidden /> Needs verification</Badge>;
}

export default async function SupportPage() {
  const actor = await requirePatientPage();
  const [resources, referrals, clinicians] = await Promise.all([
    listSupportResources(),
    listPatientReferrals(actor.patientId),
    listShareableClinicians(),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Find support · Abu Dhabi"
        title="The right level of help, when you need it"
        description="From self-help to specialist psychiatric care. Every contact shows how and when it was verified."
        actions={
          <Link href="/patient/support/share" className={buttonVariants()}>
            <Send aria-hidden /> Share a summary with a clinician
          </Link>
        }
      />

      <section aria-labelledby="my-referrals" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="my-referrals" className="font-display text-xl text-ink">My referrals</h2>
        </div>
        <ReferralList
          referrals={referrals.map((r) => ({
            ...r,
            requestedAt: r.requestedAt.toISOString(),
            events: r.events.map((e) => ({ id: e.id, toStatus: e.toStatus, actorRole: e.actorRole, note: e.note, createdAt: e.createdAt.toISOString() })),
            followUps: r.followUps.map((f) => ({ id: f.id, scheduledFor: f.scheduledFor.toISOString(), status: f.status })),
          }))}
          demoMode={getEnv().DEMO_MODE}
        />
        <RequestReferral
          clinicians={clinicians}
          resources={resources.filter((r) => ["PRIMARY_CARE", "PSYCHIATRIC_SPECIALIST", "TELE_MENTAL_HEALTH"].includes(r.category)).map((r) => ({ id: r.id, name: r.name }))}
        />
      </section>

      {LEVELS.map((level) => {
        const items = resources.filter((r) => r.category === level.key);
        if (!items.length) return null;
        return (
          <section key={level.key} aria-labelledby={`lvl-${level.key}`}>
            <h2 id={`lvl-${level.key}`} className="font-display text-xl text-ink">{level.title}</h2>
            <p className="mb-3 text-sm text-muted">{level.description}</p>
            <div className="grid gap-3 md:grid-cols-2">
              {items.map((r) => (
                <Card key={r.id} className={level.key === "EMERGENCY" ? "border-safety-100" : ""}>
                  <div className="space-y-2 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="font-semibold text-ink">{r.name}</h3>
                      <Verification status={r.verificationStatus} />
                    </div>
                    <p className="text-sm text-ink-soft">{r.description}</p>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted">
                      {r.hours && (<><dt>Hours</dt><dd className="text-ink-soft">{r.hours}</dd></>)}
                      {r.languages && (<><dt>Languages</dt><dd className="text-ink-soft">{r.languages}</dd></>)}
                      {r.eligibility && (<><dt>Eligibility</dt><dd className="text-ink-soft">{r.eligibility}</dd></>)}
                    </dl>
                    <p className="rounded-xl bg-sand/50 p-2.5 text-sm text-ink-soft"><span className="font-medium text-ink">Next step: </span>{r.nextSteps}</p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {r.phone && r.dial && (
                        <a href={`tel:${r.dial}`} className={buttonVariants({ size: "sm", variant: level.key === "EMERGENCY" ? "safety" : "soft" })}>
                          <Phone aria-hidden /> {r.phone}
                        </a>
                      )}
                      {r.website && (
                        <a href={r.website} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "sm", variant: "secondary" })}>
                          <Globe aria-hidden /> Website
                        </a>
                      )}
                    </div>
                    {(r.verificationNote || r.sourceUrl) && (
                      <p className="text-[11px] text-muted">
                        {r.verificationNote}
                        {r.sourceUrl && (
                          <>
                            {" "}
                            <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">Source</a>
                          </>
                        )}
                        {r.verifiedAt && ` · checked ${new Date(r.verifiedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}
                      </p>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

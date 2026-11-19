import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { requireHospitalPage } from "@/lib/auth/current-user";
import { getCase } from "@/server/services/emergency.service";
import { AppError } from "@/lib/errors";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, PageHeader } from "@/components/ui/primitives";
import { EmergencyStatusBadge } from "@/components/hospital/status-badge";
import { CaseActions, FamilyPanel } from "@/components/hospital/case-actions";
import { allowedNext, STATUS_LABEL } from "@/features/emergency/state-machine";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Emergency case" };

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireHospitalPage();
  const { id } = await params;
  let c: Awaited<ReturnType<typeof getCase>>;
  try {
    c = await getCase(actor, id);
  } catch (e) {
    if (e instanceof AppError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) {
      return <EmptyState icon={<Lock />} title="Case not available" description="This case was not routed to your hospital. The attempt has been recorded in the audit log." />;
    }
    throw e;
  }
  const rows: [string, string][] = [
    ["Case reference", c.caseRef],
    ["Patient", c.patient ? `${c.patient.label}${c.patient.ageBand ? ` · ${c.patient.ageBand}` : ""}` : "No linked record"],
    ["Alert time", formatDateTime(c.createdAt)],
    ["Location", c.location ?? "Not provided"],
    ["Type of concern", c.concernType],
    ["Assigned responder", c.assignedResponder ?? "Not yet assigned"],
    ["Consent / legal authorisation", c.authorizationStatus],
  ];
  return (
    <div className="space-y-6">
      <Link href="/hospital" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Emergency dashboard
      </Link>
      {c.aiDetected && (c.status === "DETECTED" || c.status === "REVIEW_REQUESTED") && (
        <p role="alert" className="rounded-2xl border-2 border-safety-500 bg-safety-50 px-4 py-3 text-sm font-semibold text-safety-700" data-testid="ai-alert-banner">
          Urgent: Sakinah AI detected suicide warning signs. Review the risk report and act immediately: acknowledge, then call the patient.
        </p>
      )}
      <PageHeader eyebrow="Emergency case" title={c.caseRef} description={c.concernType} actions={<EmergencyStatusBadge status={c.status} />} />
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Case details</CardTitle>
            <CardDescription>Minimum permitted context only. Full conversation history is never shared with the hospital.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
              {rows.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="rounded-xl bg-primary-subtle p-3 text-sm text-ink-soft" data-testid="case-context">
              <p className="text-xs font-semibold text-ink">{c.aiDetected ? "Sakinah AI risk report" : "Brief permitted context"}</p>
              <p className="mt-1 whitespace-pre-line">{c.context}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Response</CardTitle>
            <CardDescription>Current state: {STATUS_LABEL[c.status]}. Each step is validated and audited.</CardDescription>
          </CardHeader>
          <CardContent>
            <CaseActions caseId={c.id} next={allowedNext(c.status)} />
          </CardContent>
        </Card>
      </div>
      {c.patient && (
        <Card>
          <CardHeader>
            <CardTitle>Trusted-contact coordination</CardTitle>
            <CardDescription>
              Only contacts the patient has authorised for safety messages can be included, and only with the fixed safety-plan message. Chat history is never shared.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FamilyPanel caseId={c.id} contacts={c.family} canNotify={["ACKNOWLEDGED", "CONTACT_ATTEMPTED", "ASSISTANCE_ARRANGED", "UNABLE_TO_CONTACT"].includes(c.status)} />
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Event timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 border-s-2 border-brand-100 ps-4" data-testid="case-timeline">
            {c.events.map((e) => (
              <li key={e.id} className="relative text-sm">
                <span className="absolute -start-[23px] top-1 size-3 rounded-full border-2 border-white bg-brand-600" aria-hidden />
                <p className="font-medium text-ink">
                  {e.kind === "FAMILY_NOTIFICATION_SIMULATED" ? "Trusted contact notified" : e.kind === "AI_RISK_SIGNAL" ? "Sakinah AI detected warning signs" : e.toStatus ? STATUS_LABEL[e.toStatus] : e.kind}
                </p>
                <p className="text-xs text-muted">
                  {formatDateTime(e.createdAt)} · {e.actorRole === "SAKINAH_AI" ? "Sakinah AI" : e.actorRole.replace(/_/g, " ").toLowerCase()}
                </p>
                {e.note && <p className="mt-0.5 text-ink-soft">{e.note}</p>}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

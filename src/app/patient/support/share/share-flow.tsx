"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Loader2, Lock, Send, CheckCircle2, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Callout, Card, CardContent, CardHeader, CardTitle, SimulatedBadge, Textarea } from "@/components/ui/primitives";
import { SummaryView } from "@/components/clinician/summary-view";
import { CLINICIAN_SHARE_CATEGORIES, CONCERN_AREAS, CONCERN_DURATION, CONCERN_FREQUENCY, CONCERN_IMPACT, HELP_WANTED, type ClinicianShareCategory } from "@/features/consent/policy";
import type { SummaryContent } from "@/server/services/summary.service";
import { api, ApiError } from "@/lib/api-client";
import { cn, formatDate } from "@/lib/utils";

interface Clinician {
  id: string;
  name: string;
  title: string;
  specialty: string;
  organization: string;
  isSynthetic: boolean;
}
interface SharedSummary {
  id: string;
  clinicianName: string;
  clinicianOrg: string;
  consentId: string;
  status: string;
  sharedAt: string;
  revokedAt: string | null;
  reviewedAt: string | null;
  categories: string[];
}

interface Concerns {
  areas: (keyof typeof CONCERN_AREAS)[];
  duration: keyof typeof CONCERN_DURATION | "";
  frequency: keyof typeof CONCERN_FREQUENCY | "";
  dailyLifeImpact: keyof typeof CONCERN_IMPACT | "";
  helpWanted: keyof typeof HELP_WANTED | "";
}

/** Patient-reported concerns: the patient chooses every answer; nothing is inferred. */
function ConcernsForm({ value, onChange }: { value: Concerns; onChange: (v: Concerns) => void }) {
  const chip = (active: boolean) => cn("rounded-full border px-3 py-1.5 text-sm", active ? "border-brand-500 bg-brand-50 text-brand-800" : "border-line text-ink-soft");
  const single = <K extends "duration" | "frequency" | "dailyLifeImpact" | "helpWanted">(key: K, options: Record<string, string>, legend: string) => (
    <fieldset>
      <legend className="text-xs font-medium text-ink-soft">{legend}</legend>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {Object.entries(options).map(([k, label]) => (
          <button key={k} type="button" aria-pressed={value[key] === k} className={chip(value[key] === k)} onClick={() => onChange({ ...value, [key]: k })}>
            {label}
          </button>
        ))}
      </div>
    </fieldset>
  );
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface p-3" data-testid="concerns-form">
      <p className="text-xs text-muted">In your own words: you choose every answer. Sakinah never fills this in for you.</p>
      <fieldset>
        <legend className="text-xs font-medium text-ink-soft">What are you finding difficult?</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {(Object.keys(CONCERN_AREAS) as (keyof typeof CONCERN_AREAS)[]).map((a) => {
            const on = value.areas.includes(a);
            return (
              <button key={a} type="button" aria-pressed={on} className={chip(on)} onClick={() => onChange({ ...value, areas: on ? value.areas.filter((x) => x !== a) : [...value.areas, a] })}>
                {CONCERN_AREAS[a]}
              </button>
            );
          })}
        </div>
      </fieldset>
      {single("duration", CONCERN_DURATION, "For how long?")}
      {single("frequency", CONCERN_FREQUENCY, "How often?")}
      {single("dailyLifeImpact", CONCERN_IMPACT, "How much does it affect work, study, relationships or daily tasks?")}
      {single("helpWanted", HELP_WANTED, "What kind of help would you like? (optional)")}
    </div>
  );
}

const DEFAULT_CATS: ClinicianShareCategory[] = ["WHO5_HISTORY", "MOOD_TRENDS", "SLEEP_STRESS", "FUNCTIONING"];

export function ShareFlow({ clinicians, summaries }: { clinicians: Clinician[]; summaries: SharedSummary[] }) {
  const router = useRouter();
  const [clinicianId, setClinicianId] = useState(clinicians[0]?.id ?? "");
  const [cats, setCats] = useState<ClinicianShareCategory[]>(DEFAULT_CATS);
  const [note, setNote] = useState("");
  const [concerns, setConcerns] = useState<Concerns>({ areas: [], duration: "", frequency: "", dailyLifeImpact: "", helpWanted: "" });
  // Answers from "Explore My Mental Wellbeing" (this tab only) prefill the concerns form.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("from")) return;
    const id = requestAnimationFrame(() => {
      try {
        const raw = sessionStorage.getItem("sts:explore-concerns");
        if (!raw) return;
        const v = JSON.parse(raw);
        setConcerns({ areas: v.areas ?? [], duration: v.duration ?? "", frequency: v.frequency ?? "", dailyLifeImpact: v.dailyLifeImpact ?? "", helpWanted: v.helpWanted ?? "" });
        setCats((cur) => (cur.includes("REPORTED_CONCERNS") ? cur : [...cur, "REPORTED_CONCERNS"]));
      } catch {
        /* optional convenience */
      }
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const reported = () =>
    cats.includes("REPORTED_CONCERNS")
      ? { areas: concerns.areas, duration: concerns.duration, frequency: concerns.frequency, dailyLifeImpact: concerns.dailyLifeImpact, helpWanted: concerns.helpWanted || null }
      : null;
  const [preview, setPreview] = useState<SummaryContent | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState<"preview" | "share" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shared, setShared] = useState<string | null>(null);

  const toggle = (c: ClinicianShareCategory) => {
    setPreview(null);
    setConfirmed(false);
    setCats((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));
  };

  async function doPreview() {
    setPending("preview");
    setError(null);
    try {
      const { preview } = await api<{ preview: SummaryContent }>("/api/summaries/preview", { body: { clinicianId, categories: cats, patientNote: note || null, reportedConcerns: reported() } });
      setPreview(preview);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not build preview");
    } finally {
      setPending(null);
    }
  }

  async function doShare() {
    setPending("share");
    setError(null);
    try {
      await api("/api/summaries", { body: { clinicianId, categories: cats, patientNote: note || null, reportedConcerns: reported(), confirm: true } });
      setShared(clinicians.find((c) => c.id === clinicianId)?.name ?? "the clinician");
      setPreview(null);
      setConfirmed(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not share");
    } finally {
      setPending(null);
    }
  }

  async function stopSharing(summaryId: string) {
    if (!confirm("Stop sharing? The clinician will immediately lose access to your shared information.")) return;
    await api(`/api/summaries/${summaryId}/revoke`, { method: "POST" });
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-5 lg:col-span-3">
        {shared && (
          <Callout tone="brand" icon={<CheckCircle2 />} data-testid="share-success">
            Your summary was shared with <strong>{shared}</strong> (a synthetic demo clinician). You can see it below and stop sharing at any time.
          </Callout>
        )}
        <Card>
          <CardHeader>
            <CardTitle>1. Choose a clinician</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {clinicians.map((c) => (
              <label
                key={c.id}
                className={cn("flex cursor-pointer items-center gap-3 rounded-2xl border p-3", clinicianId === c.id ? "border-brand-500 bg-brand-50/60" : "border-line")}
              >
                <input type="radio" name="clinician" className="accent-brand-600" checked={clinicianId === c.id} onChange={() => { setClinicianId(c.id); setPreview(null); }} />
                <Stethoscope className="size-5 text-brand-600" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">{c.name}</span>
                  <span className="block text-xs text-muted">{c.title} · {c.organization}</span>
                </span>
                {c.isSynthetic && <SimulatedBadge label="Synthetic" />}
              </label>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Choose what to include</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(CLINICIAN_SHARE_CATEGORIES) as ClinicianShareCategory[]).map((c) => (
                <label key={c} className={cn("flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-sm", cats.includes(c) ? "border-brand-200 bg-brand-50/60" : "border-line")}>
                  <input type="checkbox" className="mt-0.5 accent-brand-600" checked={cats.includes(c)} onChange={() => toggle(c)} data-testid={`share-cat-${c}`} />
                  {CLINICIAN_SHARE_CATEGORIES[c]}
                </label>
              ))}
            </div>
            {cats.includes("REPORTED_CONCERNS") && (
              <ConcernsForm
                value={concerns}
                onChange={(v) => {
                  setConcerns(v);
                  setPreview(null);
                  setConfirmed(false);
                }}
              />
            )}
            {cats.includes("PATIENT_NOTE") && (
              <Textarea rows={3} maxLength={1000} placeholder="Anything you'd like the clinician to know…" value={note} onChange={(e) => { setNote(e.target.value); setPreview(null); }} />
            )}
            {cats.includes("CONVERSATIONS") ? (
              <p className="rounded-xl border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-700" data-testid="conversations-warning">
                Your clinician will be able to read your full conversation history with Sakinah (read-only) until you stop sharing. Only this clinician, every view is recorded,
                and your conversations are never sent to the AI summary.
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-xs text-muted"><Lock className="size-3.5" aria-hidden /> Your conversations with Sakinah stay private unless you tick the option above.</p>
            )}
          </CardContent>
        </Card>

        {error && <p role="alert" className="rounded-xl bg-safety-50 px-3 py-2 text-sm text-safety-700">{error}</p>}
        <Button size="lg" variant="secondary" onClick={doPreview} disabled={!clinicianId || !cats.length || !!pending} data-testid="preview-summary">
          {pending === "preview" ? <Loader2 className="animate-spin" aria-hidden /> : <Eye aria-hidden />} 3. Preview exactly what will be shared
        </Button>

        {preview && (
          <Card className="border-brand-200" data-testid="summary-preview">
            <CardHeader>
              <CardTitle>Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <SummaryView content={preview} />
              <Callout tone="neutral" className="text-xs">
                After sharing, an AI may draft a short summary of this structured data for the clinician. It is labelled <strong>unverified</strong> until they review it, and never uses your conversations.
              </Callout>
              <label className="flex items-start gap-2.5 text-sm text-ink-soft">
                <input type="checkbox" className="mt-0.5 accent-brand-600" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                I've reviewed this summary and agree to share it with this clinician. I can revoke access at any time.
              </label>
              <Button size="lg" onClick={doShare} disabled={!confirmed || !!pending} data-testid="confirm-share">
                {pending === "share" ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />} Share summary
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Currently shared</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {summaries.length === 0 && <p className="text-sm text-muted">Nothing shared yet.</p>}
            {summaries.map((s) => (
              <div key={s.id} className="rounded-xl border border-line p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-ink">{s.clinicianName}</p>
                    <p className="text-xs text-muted">Shared {formatDate(s.sharedAt)} · {s.categories.length} categories</p>
                  </div>
                  <Badge tone={s.status === "SHARED" ? "brand" : "neutral"}>{s.status === "SHARED" ? "Active" : "Revoked"}</Badge>
                </div>
                {s.reviewedAt && <p className="mt-1 text-xs text-sage-700">Reviewed by clinician {formatDate(s.reviewedAt)}</p>}
                {s.status === "SHARED" && (
                  <Button size="sm" variant="ghost" className="mt-2 text-safety-700" onClick={() => stopSharing(s.id)}>
                    Stop sharing
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

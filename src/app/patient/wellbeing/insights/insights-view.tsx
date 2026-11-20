"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Brain, CheckCircle2, Loader2, MessageCircleHeart, RefreshCw, ShieldCheck, Trash2, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge, Callout, Card, CardContent, CardDescription, CardHeader, CardTitle, Textarea } from "@/components/ui/primitives";
import { api, ApiError } from "@/lib/api-client";
import { CATEGORY_LABEL, INSIGHT_LABEL, ITEM_SECTIONS, SECTION_LABEL, type Category, type ItemSection } from "@/features/clinical-intelligence/labels";
import type { InsightContent } from "@/features/clinical-intelligence/engine";
import { formatDate, formatDateTime } from "@/lib/utils";

interface Insights {
  enabled: boolean;
  aiAvailable: boolean;
  consent: { since: string } | null;
  carePlanConsent: { since: string } | null;
  latest: {
    id: string;
    createdAt: string;
    patientStatus: "DRAFT" | "APPROVED";
    approvedAt: string | null;
    clinicianStatus: string;
    removedItemIds: string[];
    patientNote: string | null;
    content: InsightContent & { sources: { messages: number; conversations: number; from: string; to: string; who5Count: number; checkInCount: number; consentSince: string } };
    changes: { newAreas: Category[]; noLongerMentioned: Category[]; continuing: Category[] };
  } | null;
  history: { id: string; createdAt: string; patientStatus: string }[];
  wellbeing: {
    who5: { date: string; percentScore: number }[];
    who5Trend: { direction: string; explanations: string[]; suggestProfessionalFollowUp: boolean } | null;
    checkIns: { recentCount: number; mood: { recent: number | null; prior: number | null }; sleepQuality: { recent: number | null; prior: number | null }; stress: { recent: number | null; prior: number | null }; functioning: { recent: number | null; prior: number | null } } | null;
    goals: { id: string; title: string; status: string; source: string; authorName: string | null }[];
  };
}

const RESULT_TEXT: Record<string, string> = {
  CREATED: "Your insights have been updated.",
  UNCHANGED: "Nothing new since the last update.",
  NO_DATA: "There isn't enough in your conversations since you turned this on yet. Talk with Sakinah, then try again.",
  RATE_LIMITED: "Please wait a minute before updating again.",
  AI_UNAVAILABLE: "AI analysis isn't available right now.",
  FAILED: "Sakinah couldn't prepare insights just now. Your chat is unaffected; please try again later.",
  NO_CONSENT: "Turn on the permission first.",
  DISABLED: "Clinical Intelligence is not available right now.",
};

export function InsightsView() {
  const [d, setD] = useState<Insights | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<Insights>("/api/clinical-intelligence");
      setD(r);
      setNote(r.latest?.patientNote ?? "");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load your insights");
    }
  }, []);
  useEffect(() => {
    const id = requestAnimationFrame(() => void load());
    return () => cancelAnimationFrame(id);
  }, [load]);

  async function run<T>(key: string, fn: () => Promise<T>) {
    setBusy(key);
    setError(null);
    setMsg(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }
  const consent = (scope: "CLINICAL_INTELLIGENCE" | "CARE_PLAN_SUPPORT", on: boolean) =>
    run(scope, async () => {
      const r = await api<Insights>("/api/clinical-intelligence", { body: { scope, on } });
      setD(r);
    });
  const analyze = () =>
    run("analyze", async () => {
      const r = await api<{ result: { status: string }; insights: Insights }>("/api/clinical-intelligence/analyze", { body: {} });
      setD(r.insights);
      setNote(r.insights.latest?.patientNote ?? "");
      setMsg(RESULT_TEXT[r.result.status] ?? null);
    });
  const review = (body: { removeItemIds?: string[]; note?: string | null; approve?: boolean }) =>
    run("review", async () => {
      const r = await api<Insights>(`/api/clinical-intelligence/${d!.latest!.id}/review`, { body });
      setD(r);
      if (body.approve) setMsg("Approved. You can now choose to share these insights with your clinician.");
    });

  if (error && !d) return <Callout tone="safety">{error}</Callout>;
  if (!d) return <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" aria-hidden /> Loading…</p>;
  if (!d.enabled) return <Callout tone="neutral">Clinical Intelligence is not available right now. Sakinah, your check-ins and WHO-5 still work as usual.</Callout>;

  const latest = d.latest;
  const removed = new Set(latest?.removedItemIds ?? []);
  const cats = (list: Category[]) => list.map((c) => CATEGORY_LABEL[c]).join(", ");

  return (
    <div className="space-y-5">
      {error && <p role="alert" className="rounded-xl bg-safety-50 px-3 py-2 text-sm text-safety-700">{error}</p>}
      {msg && <p role="status" className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-800" data-testid="ci-message">{msg}</p>}

      {/* Permission A: analysis for the patient's own insights */}
      <Card data-testid="ci-consent">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4 text-brand-600" aria-hidden /> Allow Sakinah to help understand my wellbeing</CardTitle>
          <CardDescription>
            With your permission, Sakinah can review what you share in conversations, identify concerns and changes over time, and prepare preliminary insights for your review. These insights are not a medical diagnosis. Your information is not shared with a clinician unless you separately authorize sharing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {d.consent ? (
            <>
              <p className="text-ink-soft">
                <Badge tone="sage">On</Badge> since {formatDateTime(d.consent.since)}. Only messages you send from that moment are analysed; earlier conversations are never used. Private (unsaved) chats and Sakinah&apos;s own replies are not included.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={analyze} disabled={!!busy || !d.aiAvailable} data-testid="ci-analyze">
                  {busy === "analyze" ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />} Update my insights
                </Button>
                <Button size="sm" variant="ghost" onClick={() => consent("CLINICAL_INTELLIGENCE", false)} disabled={!!busy} data-testid="ci-withdraw">
                  Withdraw permission
                </Button>
              </div>
              {!d.aiAvailable && <p className="text-xs text-muted">AI analysis isn&apos;t available in this environment.</p>}
              <p className="text-xs text-muted">Insights also update quietly after your conversations. Sakinah never interrupts a conversation to make a report, and urgent safety support always comes first.</p>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => consent("CLINICAL_INTELLIGENCE", true)} disabled={!!busy} data-testid="ci-enable">
                {busy === "CLINICAL_INTELLIGENCE" && <Loader2 className="animate-spin" aria-hidden />} Allow
              </Button>
              <Link href="/patient/companion" className={buttonVariants({ size: "sm", variant: "secondary" })} data-testid="ci-decline">
                Not now, just chat
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {latest ? (
        <Card data-testid="ci-insights">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2"><Brain className="size-4 text-brand-600" aria-hidden /> Your preliminary insights</CardTitle>
              <Badge tone={latest.patientStatus === "APPROVED" ? "sage" : "amber"} data-testid="ci-status">
                {latest.patientStatus === "APPROVED" ? <><CheckCircle2 className="size-3" aria-hidden /> Approved by you</> : "Draft · please review"}
              </Badge>
            </div>
            <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700" data-testid="ci-label">{INSIGHT_LABEL}</p>
            <CardDescription data-testid="ci-sources">
              Last analysed {formatDateTime(latest.createdAt)} · from {latest.content.sources.messages} of your messages in {latest.content.sources.conversations} conversation
              {latest.content.sources.conversations === 1 ? "" : "s"} ({formatDate(latest.content.sources.from)} – {formatDate(latest.content.sources.to)}), {latest.content.sources.who5Count} WHO-5 result
              {latest.content.sources.who5Count === 1 ? "" : "s"} and {latest.content.sources.checkInCount} check-ins.
              {latest.content.removed > 0 && ` ${latest.content.removed} unsupported AI statement${latest.content.removed === 1 ? " was" : "s were"} removed automatically.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 text-sm">
            {(latest.changes.newAreas.length > 0 || latest.changes.noLongerMentioned.length > 0) && (
              <Callout tone="brand" data-testid="ci-changes">
                <div>
                  <p className="font-semibold">Changes since your previous insights</p>
                  {latest.changes.newAreas.length > 0 && <p>New: {cats(latest.changes.newAreas)}</p>}
                  {latest.changes.continuing.length > 0 && <p>Still mentioned: {cats(latest.changes.continuing)}</p>}
                  {latest.changes.noLongerMentioned.length > 0 && <p>Not mentioned recently: {cats(latest.changes.noLongerMentioned)}</p>}
                </div>
              </Callout>
            )}
            {ITEM_SECTIONS.map((k: ItemSection) => {
              const items = latest.content.sections[k].filter((i) => !removed.has(i.id));
              if (!items.length) return null;
              return (
                <section key={k}>
                  <h3 className="font-semibold text-ink">{SECTION_LABEL[k]}</h3>
                  <ul className="mt-1.5 space-y-1.5">
                    {items.map((i) => (
                      <li key={i.id} className="flex items-start justify-between gap-3 rounded-xl border border-line px-3 py-2" data-testid="ci-item">
                        <span>
                          <span className="text-ink">{i.text}</span>
                          <span className="mt-0.5 block text-xs text-muted">
                            You said: “{i.quote}” · {formatDate(i.source.date)} · <Link className="underline" href={`/patient/companion?c=${i.source.conversationId}`}>conversation</Link>
                          </span>
                        </span>
                        <button type="button" className="rounded-lg p-1 text-muted hover:bg-sand" aria-label={`Remove: ${i.text}`} onClick={() => review({ removeItemIds: [i.id] })} disabled={!!busy} data-testid="ci-remove">
                          <X className="size-4" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
            {latest.content.possibleConsiderations.filter((c) => !removed.has(c.id)).length > 0 && (
              <section data-testid="ci-considerations">
                <h3 className="font-semibold text-ink">Areas a professional might explore <span className="font-normal text-muted">(AI suggestion, not a diagnosis)</span></h3>
                <ul className="mt-1.5 space-y-1.5">
                  {latest.content.possibleConsiderations
                    .filter((c) => !removed.has(c.id))
                    .map((c) => (
                      <li key={c.id} className="flex items-start justify-between gap-3 rounded-xl bg-primary-subtle px-3 py-2">
                        <span className="text-ink-soft">{c.text}</span>
                        <button type="button" className="rounded-lg p-1 text-muted hover:bg-sand" aria-label="Remove this suggestion" onClick={() => review({ removeItemIds: [c.id] })} disabled={!!busy}>
                          <X className="size-4" aria-hidden />
                        </button>
                      </li>
                    ))}
                </ul>
              </section>
            )}
            {latest.content.missingInformation.length > 0 && (
              <section>
                <h3 className="font-semibold text-ink">What is still unclear</h3>
                <ul className="mt-1 list-disc ps-5 text-ink-soft">{latest.content.missingInformation.map((t) => <li key={t}>{t}</li>)}</ul>
              </section>
            )}
            {latest.content.reviewQuestions.length > 0 && (
              <section>
                <h3 className="font-semibold text-ink">Questions you might bring to a professional</h3>
                <ul className="mt-1 list-disc ps-5 text-ink-soft">{latest.content.reviewQuestions.map((t) => <li key={t}>{t}</li>)}</ul>
              </section>
            )}
            <div className="space-y-2 rounded-xl border border-line p-3">
              <label htmlFor="ci-note" className="text-sm font-medium text-ink">Anything to correct or add? <span className="font-normal text-muted">(optional, shared only if you share these insights)</span></label>
              <Textarea id="ci-note" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} data-testid="ci-note" />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" disabled={!!busy || note === (latest.patientNote ?? "")} onClick={() => review({ note: note.trim() || null })} data-testid="ci-save-note">
                  Save correction
                </Button>
                {latest.patientStatus !== "APPROVED" && (
                  <Button size="sm" disabled={!!busy} onClick={() => review({ approve: true })} data-testid="ci-approve">
                    <CheckCircle2 aria-hidden /> These look right · approve
                  </Button>
                )}
              </div>
            </div>
            {latest.patientStatus === "APPROVED" && (
              <Callout tone="brand">
                <div className="space-y-2">
                  <p className="font-semibold">Would you like to prepare these insights for your psychologist or psychiatrist?</p>
                  <p>You choose the clinician and exactly what is shared. You can stop sharing at any time.</p>
                  <Link href="/patient/support/share?from=insights" className={buttonVariants({ size: "sm" })} data-testid="ci-share">
                    Share with my clinician
                  </Link>
                </div>
              </Callout>
            )}
          </CardContent>
        </Card>
      ) : (
        d.consent && (
          <Card>
            <CardContent className="flex items-start gap-3 pt-5 text-sm text-ink-soft" data-testid="ci-empty">
              <MessageCircleHeart className="mt-0.5 size-5 text-brand-600" aria-hidden />
              <p>No insights yet. Talk with Sakinah as you normally would; your insights will be prepared from what you share from now on, and you can review them here.</p>
            </CardContent>
          </Card>
        )
      )}

      {/* Measured wellbeing: deterministic, never AI */}
      <Card data-testid="ci-trends">
        <CardHeader>
          <CardTitle>Your wellbeing over time</CardTitle>
          <CardDescription>From your WHO-5 results and check-ins (measured, not AI). The WHO-5 is a wellbeing check, not a diagnostic test.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-ink-soft">
          {d.wellbeing.who5.length ? (
            <p>WHO-5: {d.wellbeing.who5.map((w) => `${formatDate(w.date)} ${w.percentScore}`).join(" → ")}</p>
          ) : (
            <p>No WHO-5 results yet. <Link className="text-brand-700 underline" href="/patient/wellbeing/who5">Take the WHO-5</Link></p>
          )}
          {d.wellbeing.who5Trend?.explanations.map((e) => <p key={e} className="text-xs text-muted">{e}</p>)}
          {d.wellbeing.checkIns && (
            <p>
              Check-ins (1–5), last 7 days vs the week before: mood {d.wellbeing.checkIns.mood.recent ?? "–"} vs {d.wellbeing.checkIns.mood.prior ?? "–"} · sleep {d.wellbeing.checkIns.sleepQuality.recent ?? "–"} vs{" "}
              {d.wellbeing.checkIns.sleepQuality.prior ?? "–"} · stress {d.wellbeing.checkIns.stress.recent ?? "–"} vs {d.wellbeing.checkIns.stress.prior ?? "–"} · daily functioning {d.wellbeing.checkIns.functioning.recent ?? "–"} vs{" "}
              {d.wellbeing.checkIns.functioning.prior ?? "–"}
            </p>
          )}
          {d.wellbeing.goals.length > 0 && (
            <div>
              <p className="font-medium text-ink">Goals</p>
              <ul className="mt-1 space-y-1">
                {d.wellbeing.goals.map((g) => (
                  <li key={g.id} data-testid={g.source === "CLINICIAN" ? "ci-clinician-goal" : undefined}>
                    {g.title} <span className="text-xs text-muted">· {g.status.toLowerCase()}{g.source === "CLINICIAN" ? ` · from ${g.authorName ?? "your clinician"}` : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Permission C: care-plan goals in conversations */}
      {d.wellbeing.goals.some((g) => g.source === "CLINICIAN") && (
        <Card data-testid="ci-careplan">
          <CardHeader>
            <CardTitle>Let Sakinah support my clinician&apos;s follow-up goals</CardTitle>
            <CardDescription>
              Sakinah can gently check in on the goals your clinician set with you (for example your evening routine). It never changes your plan, never sees your clinician&apos;s private notes, and never gives medication advice.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {d.carePlanConsent ? (
              <Button size="sm" variant="ghost" onClick={() => consent("CARE_PLAN_SUPPORT", false)} disabled={!!busy} data-testid="ci-careplan-off">
                <Badge tone="sage">On</Badge> Turn off
              </Button>
            ) : (
              <Button size="sm" onClick={() => consent("CARE_PLAN_SUPPORT", true)} disabled={!!busy} data-testid="ci-careplan-on">
                Allow
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {d.history.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span>{d.history.length} insight update{d.history.length === 1 ? "" : "s"} stored (encrypted).</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (window.confirm("Delete all of your Clinical Insights? Your conversations are not affected.")) {
                void run("delete", async () => {
                  await api("/api/clinical-intelligence/delete", { body: {} });
                  await load();
                  setMsg("Your Clinical Insights were deleted.");
                });
              }
            }}
            disabled={!!busy}
            data-testid="ci-delete"
          >
            <Trash2 aria-hidden /> Delete my insights
          </Button>
        </div>
      )}
    </div>
  );
}

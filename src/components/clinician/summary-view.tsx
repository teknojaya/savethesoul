import { CLINICIAN_SHARE_CATEGORIES, type ClinicianShareCategory } from "@/features/consent/policy";
import type { SummaryContent } from "@/server/services/summary.service";
import { formatDate } from "@/lib/utils";

/** Renders the deterministic, patient-approved summary snapshot. Shared by patient preview & clinician view. */
export function SummaryView({ content }: { content: SummaryContent }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap gap-1.5">
        {content.categories.map((c) => (
          <span key={c} className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs text-teal-700">
            {CLINICIAN_SHARE_CATEGORIES[c as ClinicianShareCategory] ?? c}
          </span>
        ))}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-ink-soft">
        <dt className="text-muted">Name</dt>
        <dd>{content.patient.preferredName}</dd>
        <dt className="text-muted">Age band</dt>
        <dd>{content.patient.ageBand ?? "Not provided"}</dd>
        <dt className="text-muted">Region</dt>
        <dd>{content.patient.region}</dd>
        <dt className="text-muted">Prepared</dt>
        <dd>{formatDate(content.generatedAt)}</dd>
      </dl>

      {content.who5 && (
        <section>
          <h4 className="font-semibold text-ink">WHO-5 history</h4>
          {content.who5.length ? (
            <p className="mt-1 tabular-nums text-ink-soft">
              {content.who5.map((w) => `${formatDate(w.date, { day: "numeric", month: "short" })}: ${w.percentScore}`).join(" → ")}
            </p>
          ) : (
            <p className="text-muted">No assessments yet.</p>
          )}
          {content.who5TrendNotes?.map((n) => <p key={n} className="mt-1 text-xs text-muted">{n}</p>)}
        </section>
      )}
      {content.mood && (
        <section>
          <h4 className="font-semibold text-ink">Mood (self-reported, 1–5)</h4>
          <p className="text-ink-soft">Last 7 days avg {content.mood.recentAvg ?? "—"} (prior week {content.mood.priorAvg ?? "—"}), {content.mood.recentCount} check-ins</p>
        </section>
      )}
      {content.sleepStress && (
        <section>
          <h4 className="font-semibold text-ink">Sleep & stress (1–5)</h4>
          <p className="text-ink-soft">
            Sleep {content.sleepStress.sleepRecent ?? "—"} (prior {content.sleepStress.sleepPrior ?? "—"}) · Stress {content.sleepStress.stressRecent ?? "—"} (prior {content.sleepStress.stressPrior ?? "—"})
          </p>
        </section>
      )}
      {content.functioning && (
        <section>
          <h4 className="font-semibold text-ink">Daily functioning (1–5)</h4>
          <p className="text-ink-soft">Last 7 days {content.functioning.recentAvg ?? "—"} (prior {content.functioning.priorAvg ?? "—"})</p>
        </section>
      )}
      {content.goals && (
        <section>
          <h4 className="font-semibold text-ink">Goals</h4>
          <p className="text-ink-soft">{content.goals.length ? content.goals.join(" · ") : "None"}</p>
        </section>
      )}
      {content.physicalHealthContext !== undefined && (
        <section>
          <h4 className="font-semibold text-ink">Physical health context</h4>
          <p className="text-ink-soft">{content.physicalHealthContext ?? "None provided"}</p>
        </section>
      )}
      {content.reportedConcerns && (
        <section data-testid="reported-concerns">
          <h4 className="font-semibold text-ink">Patient-reported concerns</h4>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-ink-soft">
            <dt className="text-muted">Areas</dt>
            <dd>{content.reportedConcerns.areas.join(" · ")}</dd>
            <dt className="text-muted">For</dt>
            <dd>{content.reportedConcerns.duration}</dd>
            <dt className="text-muted">How often</dt>
            <dd>{content.reportedConcerns.frequency}</dd>
            <dt className="text-muted">Daily-life impact</dt>
            <dd>{content.reportedConcerns.dailyLifeImpact}</dd>
            {content.reportedConcerns.helpWanted && (
              <>
                <dt className="text-muted">Help wanted</dt>
                <dd>{content.reportedConcerns.helpWanted}</dd>
              </>
            )}
          </dl>
        </section>
      )}
      {content.referralHistory && (
        <section>
          <h4 className="font-semibold text-ink">Referral history (simulated)</h4>
          {content.referralHistory.length ? (
            <ul className="mt-1 space-y-0.5 text-ink-soft">
              {content.referralHistory.map((r) => (
                <li key={r.requestedAt}>
                  {formatDate(r.requestedAt)} · {r.with ?? "Service"}
                  {r.careType ? ` (${r.careType.toLowerCase().replace("_", " ")})` : ""} · {r.status.toLowerCase().replace(/_/g, " ")}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">No referrals yet.</p>
          )}
        </section>
      )}
      {content.patientNote !== undefined && (
        <section>
          <h4 className="font-semibold text-ink">Note from the patient</h4>
          <p className="whitespace-pre-wrap text-ink-soft">{content.patientNote || "—"}</p>
        </section>
      )}
      <section className="rounded-xl bg-sand/50 p-3 text-xs text-muted">
        <p className="font-medium text-ink-soft">Limitations & exclusions</p>
        <ul className="mt-1 space-y-0.5">
          {[...content.limitations, ...content.excluded].map((l) => <li key={l}>• {l}</li>)}
        </ul>
      </section>
    </div>
  );
}
